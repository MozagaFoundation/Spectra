import { assert, assertEquals } from "./assert.ts";
import { ROUTE_INVENTORY } from "./fixtures/contracts.ts";

const migrationsRoot = new URL("../migrations/", import.meta.url);
const functionsRoot = new URL("../functions/", import.meta.url);
const routerSourceUrl = new URL(
  "../functions/_shared/router.ts",
  import.meta.url,
);
const chatSourceUrl = new URL(
  "../functions/_shared/chat.ts",
  import.meta.url,
);
const walletSourceUrl = new URL(
  "../functions/_shared/wallet.ts",
  import.meta.url,
);
const walletNotificationSourceUrl = new URL(
  "../functions/_shared/walletIndexNotifications.ts",
  import.meta.url,
);
const walletActivationMigrationUrl = new URL(
  "../migrations/20260801220356_wallet_index_activation.sql",
  import.meta.url,
);
const retentionScheduleMigrationUrl = new URL(
  "../migrations/20260802041919_restore_privacy_retention_schedule.sql",
  import.meta.url,
);
const supabaseConfig = new URL("../config.toml", import.meta.url);
const mobileRoots = [
  new URL("../../services/", import.meta.url),
  new URL("../../packages/spectra-core-crypto/src/server/", import.meta.url),
];

Deno.test("route inventory covers every registered API handler", () => {
  const seen = new Set<string>();
  for (const route of ROUTE_INVENTORY) {
    assert(!seen.has(route.path), `duplicate route contract: ${route.path}`);
    seen.add(route.path);
    assert(
      route.methods.length > 0,
      `route has no method contract: ${route.path}`,
    );
    assert(
      route.contractIds.length > 0,
      `route has no behavioral coverage: ${route.path}`,
    );
  }
  const required = [
    "auth.challenge",
    "auth.mldsa-verify",
    "auth.refresh-rotation",
    "relay.sealed-message",
    "relay.receipts",
    "objects.signed-upload",
    "account.delete",
    "admin.role-auth",
    "realtime.subscribe-ack-event",
  ];
  const covered = new Set(
    ROUTE_INVENTORY.flatMap(({ contractIds }) => contractIds),
  );
  for (const contract of required) {
    assert(covered.has(contract), `missing critical contract: ${contract}`);
  }
});

Deno.test("mobile backend routes are represented by contracts", async () => {
  const files = (await Promise.all(
    mobileRoots.map((root) => filesUnder(root, ".ts")),
  )).flat().filter((file) => !file.pathname.endsWith(".test.ts"));
  const routes = new Set<string>();
  for (const file of files) {
    const source = await Deno.readTextFile(file);
    for (
      const match of source.matchAll(/["'`]((?:\/v1\/)[A-Za-z0-9_./:-]*)/gu)
    ) {
      const suffix = source.slice((match.index ?? 0) + match[0].length);
      if (/^\$\d/u.test(suffix)) continue;
      routes.add(match[1]!);
    }
  }
  for (const path of routes) {
    const covered = ROUTE_INVENTORY.some((route) =>
      route.path === path ||
      (route.path.endsWith("/") && path.startsWith(route.path))
    );
    assert(
      covered,
      `mobile backend route has no server contract: ${path}`,
    );
  }
});

Deno.test("contact-card creation accepts the encrypted profile capsule", async () => {
  const source = await Deno.readTextFile(routerSourceUrl);
  const start = source.indexOf(`if (path === '/v1/chat/contact-cards')`);
  const end = source.indexOf(
    `if (path.startsWith('/v1/chat/contact-cards/'))`,
    start,
  );
  assert(start >= 0 && end > start, "contact-card creation route is missing");
  assert(
    source.slice(start, end).includes("'profileCapsule'"),
    "contact-card creation drops the encrypted profile capsule",
  );
});

Deno.test("contact-card owner status stays owner-bound and opaque", async () => {
  const [routerSource, chatSource] = await Promise.all([
    Deno.readTextFile(routerSourceUrl),
    Deno.readTextFile(chatSourceUrl),
  ]);
  const functionStart = chatSource.indexOf(
    "export async function contactCardOwnerStatus",
  );
  const functionEnd = chatSource.indexOf("\nexport ", functionStart + 1);
  assert(functionStart >= 0, "contact-card owner status is missing");
  const statusSource = chatSource.slice(
    functionStart,
    functionEnd >= 0 ? functionEnd : undefined,
  );
  assert(
    statusSource.includes("owner_user_id=${principal.userId}"),
    "contact-card owner status is not scoped to the authenticated owner",
  );
  assert(
    statusSource.includes("wallet_address=${principal.walletAddress}"),
    "contact-card owner status is not scoped to the authenticated wallet",
  );
  assert(
    statusSource.includes("redeemed_at is null") &&
      statusSource.includes("expires_at > now()"),
    "contact-card owner status does not require an active card",
  );
  assert(
    statusSource.includes("return { active: rows.length === 1 }"),
    "contact-card owner status leaks more than availability",
  );
  assert(
    routerSource.includes(
      "contactCardOwnerStatus(principal, cardId)",
    ),
    "contact-card owner status bypasses principal authentication",
  );
});

Deno.test("contact-card creation permits only one active owner card", async () => {
  const source = await Deno.readTextFile(chatSourceUrl);
  const start = source.indexOf("export async function createContactCard");
  const end = source.indexOf(
    "\nexport async function redeemContactCard",
    start,
  );
  assert(start >= 0 && end > start, "contact-card creation is missing");
  const creationSource = source.slice(start, end);
  assert(
    creationSource.includes("lockContactCardOwner"),
    "contact-card creation does not serialize owner card creation",
  );
  assert(
    source.includes("spectra.contact-card.owner.v1"),
    "contact-card creation lock is not owner-scoped",
  );
  assert(
    creationSource.includes("throw new HttpError(409, 'contact_card_active')"),
    "contact-card creation permits multiple active owner cards",
  );
  assert(
    creationSource.indexOf("contact_card_active") <
      creationSource.indexOf("verifyAndConsumeVdfChallenge"),
    "contact-card creation consumes a VDF proof before enforcing the single-card policy",
  );
});

Deno.test("published OPKs cannot resurrect an active contact-card pre-key", async () => {
  const source = await Deno.readTextFile(chatSourceUrl);
  const helperStart = source.indexOf("async function insertUnconsumedOpks");
  const helperEnd = source.indexOf(
    "\nexport async function createContactCard",
    helperStart,
  );
  assert(
    helperStart >= 0 && helperEnd > helperStart,
    "OPK insert helper is missing",
  );
  const helperSource = source.slice(helperStart, helperEnd);
  assert(
    helperSource.includes("chat_one_time_contact_cards"),
    "OPK insert does not exclude active contact-card pre-keys",
  );
  assert(
    helperSource.includes("reservedIds.has(opk.id as number)"),
    "OPK insert does not skip reserved contact-card pre-keys",
  );

  const publishStart = source.indexOf("export async function publishBundle");
  const publishEnd = source.indexOf(
    "\nfunction validateContactCardCapability",
    publishStart,
  );
  assert(
    publishStart >= 0 && publishEnd > publishStart,
    "public bundle publish is missing",
  );
  const publishSource = source.slice(publishStart, publishEnd);
  assert(
    publishSource.includes("lockContactCardOwner"),
    "public bundle publish does not serialize against contact-card allocation",
  );
  assert(
    publishSource.includes("insertUnconsumedOpks"),
    "public bundle publish can resurrect a reserved contact-card pre-key",
  );
  assert(
    publishSource.includes(
      "throw new HttpError(409, 'public_discovery_active')",
    ),
    "public bundle publish permits refreshing a live discovery lease",
  );
  assert(
    publishSource.indexOf("public_discovery_active") <
      publishSource.indexOf("verifyAndConsumeVdfChallenge"),
    "public bundle publish consumes a VDF proof before enforcing the live-lease policy",
  );

  const challengeStart = source.indexOf(
    "export async function issueVdfChallenge",
  );
  const challengeEnd = source.indexOf(
    "\nasync function verifyAndConsumeVdfChallenge",
    challengeStart,
  );
  assert(
    challengeStart >= 0 && challengeEnd > challengeStart,
    "VDF challenge issue is missing",
  );
  const challengeSource = source.slice(challengeStart, challengeEnd);
  assert(
    challengeSource.includes(
      "throw new HttpError(409, 'public_discovery_active')",
    ),
    "VDF challenge issue permits a puzzle while public discovery is already live",
  );
  assert(
    challengeSource.indexOf("public_discovery_active") <
      challengeSource.indexOf("rateLimitVdfChallenge"),
    "VDF challenge issue rate-limits before rejecting a live public discovery lease",
  );

  const fetchRequestorStart = source.indexOf(
    "async function fetchBundleForRequestor",
  );
  const fetchRequestorEnd = source.indexOf(
    "\nasync function allocateOpkForRequestor",
    fetchRequestorStart,
  );
  assert(
    fetchRequestorStart >= 0 && fetchRequestorEnd > fetchRequestorStart,
    "static bundle fetch helper is missing",
  );
  const fetchRequestorSource = source.slice(
    fetchRequestorStart,
    fetchRequestorEnd,
  );
  assert(
    !fetchRequestorSource.includes("claim_chat_one_time_prekey"),
    "directory lookup still consumes a one-time pre-key",
  );

  const claimStart = source.indexOf("export async function claimSessionOpk");
  const claimEnd = source.indexOf(
    "\nfunction validateContactCardCapability",
    claimStart,
  );
  assert(
    claimStart >= 0 && claimEnd > claimStart,
    "session OPK claim is missing",
  );
  const claimSource = source.slice(claimStart, claimEnd);
  assert(
    claimSource.includes("verifyAndConsumeVdfChallenge"),
    "session OPK claim does not require a VDF proof",
  );
  assert(
    claimSource.includes("allocateOpkForRequestor"),
    "session OPK claim does not allocate a one-time pre-key",
  );
  assert(
    claimSource.indexOf("verifyAndConsumeVdfChallenge") <
      claimSource.indexOf("allocateOpkForRequestor"),
    "session OPK claim allocates a pre-key before verifying the VDF proof",
  );
  const allocateStart = source.indexOf(
    "async function allocateOpkForRequestor",
  );
  const allocateEnd = source.indexOf(
    "\nexport async function fetchDiscoverableBundle",
    allocateStart,
  );
  assert(
    allocateStart >= 0 && allocateEnd > allocateStart,
    "OPK allocation helper is missing",
  );
  assert(
    source.slice(allocateStart, allocateEnd).includes(
      "claim_chat_one_time_prekey",
    ),
    "OPK allocation helper does not consume a one-time pre-key",
  );

  const replenishStart = source.indexOf("export async function replenishOpks");
  const replenishEnd = source.indexOf(
    "\nexport async function listMailboxes",
    replenishStart,
  );
  assert(
    replenishStart >= 0 && replenishEnd > replenishStart,
    "OPK replenish is missing",
  );
  const replenishSource = source.slice(replenishStart, replenishEnd);
  assert(
    replenishSource.includes("lockContactCardOwner"),
    "OPK replenish does not serialize against contact-card allocation",
  );
  assert(
    replenishSource.includes("insertUnconsumedOpks"),
    "OPK replenish can resurrect a reserved contact-card pre-key",
  );
});

Deno.test("wallet index retains operation payloads only in delivery events", async () => {
  const [walletSource, migration] = await Promise.all([
    Deno.readTextFile(walletSourceUrl),
    Deno.readTextFile(walletActivationMigrationUrl),
  ]);
  assert(
    migration.includes("drop table if exists public.wallet_index_transactions"),
    "wallet activation migration retains legacy remote transaction history",
  );
  assert(
    !walletSource.includes("wallet_index_transactions"),
    "wallet worker persists transaction history outside transient delivery events",
  );
  assert(
    walletSource.includes("delete from wallet_index_delivery_events"),
    "wallet delivery acknowledgements do not delete transient server events",
  );
});

Deno.test("wallet wakeup deletion selects the bigint PGMQ overload", async () => {
  const source = await Deno.readTextFile(walletNotificationSourceUrl);
  assert(
    source.includes(
      "pgmq.delete('wallet_index_wakeups', ${messageId}::bigint)",
    ),
    "wallet wakeup deletion leaves the PGMQ overload ambiguous",
  );
});

Deno.test("wallet activation retires the stale retention schedule", async () => {
  const source = await Deno.readTextFile(retentionScheduleMigrationUrl);
  assert(
    source.includes("spectra_private.run_privacy_retention_maintenance(10000)"),
    "privacy retention is not scheduled",
  );
  assert(
    source.includes(
      "drop function if exists spectra_private.run_retention_maintenance(integer)",
    ),
    "legacy retention routine remains deployed",
  );
});

Deno.test("privacy retention does not reference dropped wallet_index_user_addresses", async () => {
  const files = (await filesUnder(migrationsRoot, ".sql"))
    .slice()
    .sort((left, right) => left.pathname.localeCompare(right.pathname));
  const replacements: string[] = [];
  for (const file of files) {
    const source = await Deno.readTextFile(file);
    if (
      /create\s+or\s+replace\s+function\s+spectra_private\.run_privacy_retention_maintenance/iu
        .test(source)
    ) {
      replacements.push(source);
    }
  }
  assert(
    replacements.length > 0,
    "privacy retention function is missing",
  );
  const latest = replacements[replacements.length - 1]!;
  assert(
    !stripSqlComments(latest).includes("wallet_index_user_addresses"),
    "privacy retention still references dropped wallet_index_user_addresses",
  );
});

Deno.test("Supabase migrations reject permissive RLS and require public-table RLS", async () => {
  const files = await filesUnder(migrationsRoot, ".sql");
  if (files.length === 0) return;
  const sql = (await Promise.all(files.map((file) => Deno.readTextFile(file))))
    .join("\n");
  assertEquals(sqlViolations(sql), [], "unsafe Supabase migration policy");
});

Deno.test("edge functions reject secret exposure, sensitive logs, placeholders, and unbounded JSON", async () => {
  const files = await filesUnder(functionsRoot, ".ts");
  if (files.length === 0) return;
  const sources = await Promise.all(files.map(async (file) => ({
    file: file.pathname,
    source: await Deno.readTextFile(file),
  })));
  const violations = sources.flatMap(({ file, source }) =>
    sourceViolations(source).map((violation) => `${file}: ${violation}`)
  );
  assertEquals(violations, [], "unsafe edge-function source");

  const handlers = sources.filter(({ file, source }) =>
    !file.includes("/_shared/") && /\bDeno\.serve\s*\(/u.test(source)
  );
  if (handlers.length === 0) return;
  const implementation = sources.map(({ source }) => source).join("\n");
  for (
    const { path } of ROUTE_INVENTORY.filter(({ path }) =>
      path.startsWith("/v1/")
    )
  ) {
    assert(
      implementation.includes(path),
      `Supabase functions exist but route is not represented: ${path}`,
    );
  }
});

Deno.test("custom-auth Edge entrypoints bypass only the Supabase JWT gateway", async () => {
  const config = await Deno.readTextFile(supabaseConfig);
  for (
    const name of [
      "spectra-api",
      "spectra-janitor",
      "spectra-wallet-worker",
      "spectra-market-worker",
    ]
  ) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    assert(
      new RegExp(
        `\\[functions\\.${escaped}\\][^[]*verify_jwt\\s*=\\s*false`,
        "u",
      ).test(config),
      `${name} would reject custom wallet/internal authorization before application checks`,
    );
  }
});

Deno.test("static guard rules detect insecure examples", () => {
  const badSql = `
    create table public.private_messages(id uuid);
    alter table public.private_messages enable row level security;
    create policy read_everything on public.private_messages for select using (true);
  `;
  assert(
    sqlViolations(badSql).some((violation) => violation.includes("permissive")),
  );
  assert(
    sqlViolations("create table public.secrets(id uuid);").some((violation) =>
      violation.includes("RLS")
    ),
  );
  assertEquals(
    sqlViolations(`
      grant execute on function spectra_private.private_worker() to service_role;
      create policy deny_clients on public.private_worker
        for all to anon, authenticated using (false) with check (false);
    `),
    [],
  );

  const badSource = `
    // TODO: replace placeholder
    Deno.serve(async (request) => {
      console.log("authorization token", request.headers.get("authorization"));
      const body = await request.json();
      return Response.json({ serviceRole: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") });
    });
  `;
  const violations = sourceViolations(badSource);
  for (
    const expected of [
      "placeholder",
      "sensitive log",
      "unbounded JSON",
      "service-role exposure",
    ]
  ) {
    assert(
      violations.some((violation) => violation.includes(expected)),
      `guard missed ${expected}`,
    );
  }
});

function sqlViolations(rawSql: string): string[] {
  const sql = stripSqlComments(rawSql).toLowerCase();
  const violations: string[] = [];
  const statements = sql.split(";");
  for (const statement of statements) {
    if (
      /create\s+policy\b/u.test(statement) &&
      /(?:using|with\s+check)\s*\(\s*(?:true|1\s*=\s*1)\s*\)/u.test(statement)
    ) violations.push("permissive RLS policy");
    if (
      /create\s+policy\b/u.test(statement) &&
      /\bto\s+(?:anon|authenticated)\b/u.test(statement) &&
      !(
        /using\s*\(\s*false\s*\)/u.test(statement) &&
        /with\s+check\s*\(\s*false\s*\)/u.test(statement)
      )
    ) violations.push("custom-auth table exposed to a client role");
  }
  const publicTables = [...sql.matchAll(
    /create\s+table(?:\s+if\s+not\s+exists)?\s+(?:(public)\.)?["]?([a-z_][a-z0-9_]*)["]?\s*\(/gu,
  )].filter((match) => match[1] === "public" || match[1] === undefined)
    .map((match) => match[2]!);
  const dynamicRlsTables = new Set<string>();
  for (
    const match of sql.matchAll(
      /foreach\s+v_table\s+in\s+array\s+array\s*\[([\s\S]*?)\][\s\S]*?alter table public\.%i enable row level security/gu,
    )
  ) {
    for (const table of match[1]!.matchAll(/'([a-z_][a-z0-9_]*)'/gu)) {
      dynamicRlsTables.add(table[1]!);
    }
  }
  for (const table of new Set(publicTables)) {
    const escaped = table.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const enablesRls = new RegExp(
      `alter\\s+table(?:\\s+if\\s+exists)?\\s+(?:public\\.)?"?${escaped}"?\\s+enable\\s+row\\s+level\\s+security`,
      "u",
    ).test(sql);
    if (!enablesRls && !dynamicRlsTables.has(table)) {
      violations.push(`public table ${table} is missing RLS`);
    }
  }
  if (
    statements.some((statement) =>
      /\bgrant\s+(?!usage\s+on\s+schema)[\s\S]*?\bto\s+(?:anon|authenticated)\b/u
        .test(statement)
    )
  ) {
    violations.push("client role grant bypasses custom wallet authorization");
  }
  return violations;
}

function sourceViolations(source: string): string[] {
  const violations: string[] = [];
  if (
    /\b(?:todo|fixme)\b|not[_ -]?implemented|status\s*:\s*501/iu.test(source)
  ) {
    violations.push("placeholder handler");
  }
  if (/\b(?:request|req)\.json\s*\(/u.test(source)) {
    violations.push("unbounded JSON parser; use a byte-limited strict parser");
  }
  if (
    /\b(?:request|req)\.(?:arrayBuffer|text|formData|blob)\s*\(/u.test(source)
  ) {
    violations.push(
      "unbounded request body; stream and enforce a hard byte limit",
    );
  }
  if (
    /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/u.test(
      source,
    )
  ) {
    violations.push("hard-coded JWT or service credential");
  }
  for (const line of source.split("\n")) {
    if (/\bconsole\.(?:log|info|warn|error|debug)\s*\(/u.test(line)) {
      violations.push(
        "sensitive log field; use the redacting structured logger",
      );
    }
    if (
      /SUPABASE_SERVICE_ROLE_KEY|service[_ -]?role/iu.test(line) &&
      /\b(?:console\.|Response|respond|JSON\.stringify|headers?\.set)\b/u.test(
        line,
      )
    ) violations.push("service-role exposure");
  }
  if (
    /SUPABASE_SERVICE_ROLE_KEY|service[_ -]?role/iu.test(source) &&
    /\b(?:Response\.json|json)\s*\(\s*(?:config|env|secrets?)\b/iu.test(source)
  ) violations.push("service-role exposure");
  return [...new Set(violations)];
}

async function filesUnder(root: URL, suffix: string): Promise<URL[]> {
  try {
    const files: URL[] = [];
    for await (const entry of Deno.readDir(root)) {
      const url = new URL(entry.name + (entry.isDirectory ? "/" : ""), root);
      if (entry.isDirectory) files.push(...await filesUnder(url, suffix));
      else if (entry.isFile && entry.name.endsWith(suffix)) files.push(url);
    }
    return files.sort((left, right) =>
      left.pathname.localeCompare(right.pathname)
    );
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return [];
    throw error;
  }
}

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/--.*$/gmu, "");
}
