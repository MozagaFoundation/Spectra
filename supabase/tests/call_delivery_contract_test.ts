import {
  buildCallExpoPushPayload,
  callPushDispatchKey,
  callPushEventId,
  classifyExpoPushTickets,
} from "../functions/_shared/callPushPayload.ts";
import {
  assert,
  assertEquals,
  assertMatch,
  assertRejects,
  assertThrows,
} from "./assert.ts";

const eventKey = `call_event:${"a".repeat(64)}`;
const scopeId = `nsc1.${"b".repeat(32)}`;
const pushToken = "ExpoPushToken[call-delivery-test-token]";
const call = {
  eventKey,
  type: "call" as const,
  callSessionId: "call-session-1",
  callerIdentityId: "caller-identity",
  calleeIdentityId: "callee-identity",
  recipientIdentityId: "callee-identity",
  callType: "video" as const,
  expiresAt: Date.now() + 60_000,
};

Deno.test("call push identifiers are deterministic and scope-isolated", async () => {
  const eventId = await callPushEventId(eventKey, scopeId);
  const sameEventId = await callPushEventId(eventKey, scopeId);
  const otherScopeEventId = await callPushEventId(
    eventKey,
    `nsc1.${"c".repeat(32)}`,
  );
  const dispatchKey = await callPushDispatchKey(eventKey, "registration-1");
  const otherDispatchKey = await callPushDispatchKey(
    eventKey,
    "registration-2",
  );

  assertMatch(eventId, /^nev1\.[0-9a-f]{32}$/u);
  assertMatch(dispatchKey, /^call:[0-9a-f]{32}$/u);
  assertEquals(eventId, sameEventId);
  assert(
    eventId !== otherScopeEventId,
    "scope must domain-separate push event ids",
  );
  assert(
    dispatchKey !== otherDispatchKey,
    "registration must domain-separate dispatch ids",
  );

  await assertRejects(
    () => callPushEventId("call_event:invalid", scopeId),
    /invalid call push event/u,
  );
  await assertRejects(
    () => callPushDispatchKey(eventKey, ""),
    /invalid call push dispatch/u,
  );
});

Deno.test("call notifications use a generic visible warning and silent terminal cleanup", () => {
  assertEquals(
    buildCallExpoPushPayload(pushToken, scopeId, "nev1.event", call),
    {
      to: pushToken,
      title: "Spectra",
      body: "Incoming call",
      sound: "default",
      channelId: "calls",
      priority: "high",
      _contentAvailable: true,
      data: {
        type: "call",
        notificationProtocolVersion: 2,
        notificationScopeId: scopeId,
        notificationEventId: "nev1.event",
        callSessionId: "call-session-1",
        callType: "video",
      },
    },
  );

  const terminal = buildCallExpoPushPayload(pushToken, scopeId, "nev1.end", {
    ...call,
    type: "call_end",
  });
  assertEquals(terminal, {
    to: pushToken,
    channelId: "calls",
    priority: "high",
    _contentAvailable: true,
    data: {
      type: "call_end",
      notificationProtocolVersion: 2,
      notificationScopeId: scopeId,
      notificationEventId: "nev1.end",
      callSessionId: "call-session-1",
      callType: "video",
    },
  });
});

Deno.test("call push ticket classification only settles definitive provider outcomes", () => {
  assertEquals(
    classifyExpoPushTickets(
      [
        { status: "ok" },
        { status: "error", details: { error: "DeviceNotRegistered" } },
        { status: "error", details: { error: "MessageTooBig" } },
        { status: "error", details: { error: "ProviderUnavailable" } },
      ],
      ["token-1", "token-2", "token-3", "token-4"],
    ),
    {
      settledTokens: ["token-1", "token-2", "token-3"],
      invalidTokens: ["token-2"],
      retryableFailure: true,
    },
  );

  assertThrows(
    () => classifyExpoPushTickets([{ status: "ok" }], ["token-1", "token-2"]),
    /incomplete/u,
  );
});

Deno.test("call delivery migration keeps the outbox private and terminal state bounded", async () => {
  const migration = await Deno.readTextFile(
    new URL(
      "../migrations/20260730033835_call_lifecycle_delivery.sql",
      import.meta.url,
    ),
  );

  for (
    const required of [
      "pgmq.create('call_notifications')",
      "spectra_private.enqueue_call_session_notification",
      "spectra_private.read_call_notification_queue",
      "spectra_private.expire_stale_call_sessions",
      "for update skip locked",
      "revoke all on function spectra_private.enqueue_call_session_notification(jsonb)",
      "grant execute on function spectra_private.enqueue_call_session_notification(jsonb)\n  to service_role",
    ]
  ) {
    assert(
      migration.includes(required),
      `missing call delivery control: ${required}`,
    );
  }
  assert(
    !/enqueue_call_session_notification\(jsonb\)\s*\n\s*to\s+(?:anon|authenticated)/u
      .test(
        migration,
      ),
    "call delivery enqueue must not be client-callable",
  );
  assert(
    !migration.includes("[^[:space:][:cntrl:]]{1,256}"),
    "call identifier validation must use PostgreSQL-compatible regular expressions",
  );
  assert(
    !migration.includes(
      "perform spectra_private.enqueue_call_session_notification(v_session)",
    ),
    "call expiry must rely on the transactional outbox trigger",
  );
  assert(
    migration.includes("((body->>'sequence_number')::numeric)"),
    "call signal index must not overflow on legacy sequence values",
  );
});

Deno.test("call session changes atomically queue notifications and wake the worker", async () => {
  const migration = await Deno.readTextFile(
    new URL(
      "../migrations/20260730034405_call_session_outbox_trigger.sql",
      import.meta.url,
    ),
  );

  for (
    const required of [
      "create trigger spectra_call_session_notification_outbox",
      "after insert or update of body on public.mobile_app_records",
      "spectra_private.enqueue_call_session_notification(new.body)",
      "spectra_private.invoke_worker_webhook('notification-worker')",
      "revoke all on function spectra_private.enqueue_call_session_change()",
    ]
  ) {
    assert(
      migration.includes(required),
      `missing call session outbox trigger control: ${required}`,
    );
  }
});

Deno.test("call writes preserve lifecycle integrity and serialize signal delivery", async () => {
  const [appdata, migration] = await Promise.all([
    Deno.readTextFile(
      new URL("../functions/_shared/appdata.ts", import.meta.url),
    ),
    Deno.readTextFile(
      new URL(
        "../migrations/20260730040212_call_lifecycle_integrity.sql",
        import.meta.url,
      ),
    ),
  ]);

  assert(
    !appdata.includes(
      "call_sessions: { actions: 'select,insert,upsert,update'",
    ),
    "call sessions must not support upsert",
  );
  assert(
    !appdata.includes("call_signals: { actions: 'select,insert,upsert,update'"),
    "call signals must not support upsert",
  );
  for (
    const required of [
      "for update",
      "create trigger spectra_call_lifecycle_integrity",
      "invalid call state transition",
      "call_terminated",
    ]
  ) {
    assert(
      migration.includes(required),
      `missing call lifecycle integrity control: ${required}`,
    );
  }
});
