import { assert, assertEquals, assertRejects } from "./assert.ts";
import { STRICT_ERROR_CONTRACTS } from "./fixtures/contracts.ts";
import {
  AccountDeletionStore,
  canAccessAppData,
  ContractError,
  FixedWindowLimiter,
  RealtimeProtocol,
  RefreshTokenStore,
  requireAdminRole,
  SealedRelay,
  SignedObjectStore,
} from "./helpers/state_models.ts";

Deno.test("refresh tokens are hashed, rotated once, expired, and revocable", async () => {
  const store = new RefreshTokenStore();
  await store.issue("refresh-1", "user-1", "session-1", 200);
  assert(!store.records.has("refresh-1"), "raw refresh token was stored");
  assertEquals([...store.records.keys()][0]?.length, 64);

  const old = await store.rotate(
    "refresh-1",
    "refresh-2",
    "session-2",
    100,
    300,
  );
  assertEquals(old.subject, "user-1");
  await assertRejects(
    () => store.rotate("refresh-1", "refresh-3", "session-3", 101, 301),
    /refresh_token_replay/u,
  );
  await store.revoke("refresh-2", 110);
  await assertRejects(
    () => store.rotate("refresh-2", "refresh-4", "session-4", 111, 311),
    /refresh_token_replay/u,
  );

  await store.issue("expired", "user-1", "session-expired", 120);
  await assertRejects(
    () => store.rotate("expired", "next", "session-next", 120, 400),
    /refresh_token_expired/u,
  );
});

Deno.test("sealed relay is opaque, idempotent, owner-scoped, and TTL-bounded", () => {
  const relay = new SealedRelay();
  const deliveryToken = `sdv1.${"A".repeat(43)}=`;
  relay.registerMailbox("recipient-1", "smbx1.mailbox-token");
  relay.registerMailbox("other-user", "smbx1.other-mailbox");
  const request = {
    senderUserId: "sender-1",
    recipientMailboxToken: "smbx1.mailbox-token",
    deliveryToken,
    deliveryClass: "message" as const,
    sealedEnvelope: {
      version: 1,
      type: "message",
      ciphertext: "opaque",
      nonce: "n",
      tag: "t",
    },
  };
  const first = relay.send(request, 1_000, 100);
  const replay = relay.send(request, 1_001, 100);
  assertEquals(replay.id, first.id);
  assert(replay.replayed, "idempotent replay was not marked");
  assertEquals(relay.messages.size, 1);

  assertRejectsSync(
    () =>
      relay.send({
        ...request,
        sealedEnvelope: { ...request.sealedEnvelope, ciphertext: "changed" },
      }, 1_002),
    "duplicate_delivery_token",
  );
  assertEquals(relay.fetch("recipient-1", 1_050).map(({ id }) => id), [
    first.id,
  ]);
  assertEquals(
    relay.fetch("recipient-1", 1_100),
    [],
    "expired message remained visible",
  );

  assertRejectsSync(
    () => relay.mark("other-user", first.id, "delivered", 1_010),
    "unauthorized_mailbox",
  );
  const read = relay.mark("recipient-1", first.id, "read", 1_020);
  assertEquals(read.status, "read");
  assertEquals(read.deliveredAt, 1_020);
  assertEquals(read.readAt, 1_020);
  assertEquals(
    relay.mark("recipient-1", first.id, "delivered", 1_030).status,
    "read",
  );

  assertEquals(relay.receipt("attacker", first.id, deliveryToken), null);
  assertEquals(relay.receipt("sender-1", first.id, "wrong"), null);
  assertEquals(
    relay.receipt("sender-1", first.id, deliveryToken)?.status,
    "read",
  );
  assertRejectsSync(
    () => relay.delete("other-user", [first.id]),
    "unauthorized_mailbox",
  );
  assertEquals(relay.delete("recipient-1", [first.id, first.id, "missing"]), 1);
  assertEquals(relay.delete("recipient-1", [first.id]), 0);
});

Deno.test("signed object flow enforces size, expiry, ownership, and deletion", () => {
  const store = new SignedObjectStore();
  const upload = store.signUpload("user-1", 5, 100, 50);
  assertEquals(upload.method, "PUT");
  assertRejectsSync(
    () => store.put(upload.token, new TextEncoder().encode("four"), 101),
    "invalid_object_request",
  );

  const validUpload = store.signUpload("user-1", 5, 100, 50);
  store.put(validUpload.token, new TextEncoder().encode("hello"), 101);
  assertRejectsSync(
    () => store.put(validUpload.token, new TextEncoder().encode("hello"), 102),
    "unauthorized",
  );
  assertRejectsSync(
    () => store.signDownload("user-2", validUpload.objectRef, 110),
    "unauthorized",
  );
  const download = store.signDownload("user-1", validUpload.objectRef, 110, 20);
  assertEquals(
    new TextDecoder().decode(store.get(download.token, 120)),
    "hello",
  );
  assertRejectsSync(() => store.get(download.token, 130), "unauthorized");

  const activeDownload = store.signDownload(
    "user-1",
    validUpload.objectRef,
    120,
    20,
  );
  assertRejectsSync(
    () => store.delete("user-2", validUpload.objectRef),
    "unauthorized",
  );
  store.delete("user-1", validUpload.objectRef);
  assertRejectsSync(() => store.get(activeDownload.token, 121), "unauthorized");
});

Deno.test("appdata defaults closed and records are owner-scoped", () => {
  assert(canAccessAppData("user_settings", "upsert", "owner", "owner"));
  assert(!canAccessAppData("user_settings", "select", "reader", "owner"));
  assert(
    !canAccessAppData("future_private_records", "select", "owner", "owner"),
  );
  assert(!canAccessAppData("support_tickets", "select", "owner", "owner"));
  assert(!canAccessAppData("chat_group_members", "delete", "owner", "owner"));
  assert(!canAccessAppData("chat_group_messages", "update", "owner", "owner"));
});

Deno.test("account deletion stores only token hashes and returns coarse progress", async () => {
  const store = new AccountDeletionStore();
  const token = "operation-token-that-is-at-least-32-bytes";
  await assertRejects(
    () => store.start("user-1", "delete", token),
    /invalid_confirmation/u,
  );
  await store.start("user-1", "DELETE", token);
  assert(!store.jobs.has(token), "raw deletion operation token was stored");
  const job = [...store.jobs.values()][0]!;
  assertEquals(Object.keys(job).sort(), ["stage", "status", "tokenHash"]);
  assertEquals(await store.status(token), {
    status: "pending",
    stage: "objects",
  });
  await store.complete(token);
  assertEquals(await store.status(token), {
    status: "completed",
    stage: "done",
  });
  await assertRejects(
    () => store.status("unknown-operation-token-at-least-32"),
    /deletion_status_unavailable/u,
  );
});

Deno.test("admin authorization reads only trusted app metadata roles", () => {
  requireAdminRole({ app_metadata: { roles: ["viewer", "spectra_admin"] } });
  requireAdminRole({ app_metadata: { role: "spectra_admin" } });
  for (
    const claims of [
      { role: "spectra_admin" },
      { user_metadata: { roles: ["spectra_admin"] } },
      { app_metadata: { role: "viewer" } },
    ]
  ) assertRejectsSync(() => requireAdminRole(claims), "forbidden");
});

Deno.test("fixed-window rate limiting hashes keys, isolates callers, and resets", async () => {
  const limiter = new FixedWindowLimiter(2, 1_000);
  assert(await limiter.allow("POST /v1/auth 203.0.113.1", 100));
  assert(await limiter.allow("POST /v1/auth 203.0.113.1", 200));
  assert(!await limiter.allow("POST /v1/auth 203.0.113.1", 300));
  assert(await limiter.allow("POST /v1/auth 203.0.113.2", 300));
  assert(await limiter.allow("POST /v1/auth 203.0.113.1", 1_000));
  for (const key of limiter.counts.keys()) {
    assert(!key.includes("203.0.113"), "raw rate-limit identity was stored");
  }
});

Deno.test("custom WebSocket protocol requires matching ack and gates events", () => {
  const protocol = new RealtimeProtocol();
  const subscriptions = [
    { subscriberId: "device-1", topic: "sealed_mailbox:smbx1.mailbox-token" },
    {
      subscriberId: "device-1",
      topic: `sealed_receipt:sdv1.${"A".repeat(43)}=`,
    },
  ];
  assertEquals(protocol.open(subscriptions), subscriptions);
  assertRejectsSync(
    () =>
      protocol.receive({
        type: "event",
        topic: subscriptions[0]!.topic,
        event: "message",
      }),
    "invalid_websocket_message",
  );
  assertRejectsSync(
    () =>
      protocol.receive({
        type: "subscribed",
        topic: "sealed_mailbox:other-token",
      }),
    "invalid_websocket_message",
  );
  assertEquals(
    protocol.receive({ type: "subscribed", topic: subscriptions[0]!.topic }),
    {
      kind: "ack",
      topic: subscriptions[0]!.topic,
    },
  );
  assertEquals(
    protocol.receive({
      type: "event",
      topic: subscriptions[0]!.topic,
      event: "sealed_message.insert",
      payload: { server_sequence: 7 },
    }),
    {
      kind: "event",
      topic: subscriptions[0]!.topic,
      event: "sealed_message.insert",
      payload: { server_sequence: 7 },
    },
  );
  assertEquals(protocol.close(false), 1_000);
  assertEquals(protocol.close(false), 2_000);
  for (let index = 0; index < 10; index++) protocol.close(false);
  assertEquals(protocol.close(false), 30_000);
  assertEquals(protocol.close(true), null);
});

Deno.test("error and status contracts remain exact", () => {
  assertEquals(STRICT_ERROR_CONTRACTS.invalidJson, {
    status: 400,
    body: { error: "invalid_json" },
  });
  assertEquals(STRICT_ERROR_CONTRACTS.unauthorized.body, {
    error: "unauthorized",
  });
  assertEquals(STRICT_ERROR_CONTRACTS.rateLimited.status, 429);
  assertEquals(Object.keys(STRICT_ERROR_CONTRACTS.deletionUnavailable.body), [
    "error",
  ]);
});

function assertRejectsSync(action: () => unknown, code: string): void {
  try {
    action();
  } catch (error) {
    assert(
      error instanceof ContractError,
      `expected ContractError, got ${String(error)}`,
    );
    assertEquals(error.code, code);
    return;
  }
  throw new Error(`expected ${code}`);
}
