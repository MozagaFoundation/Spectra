export const ML_DSA_INTEROP = {
  seed: Uint8Array.from({ length: 32 }, (_, index) => index),
  challenge: "EXO wallet auth\n" +
    "version:1\n" +
    "uid:user-1\n" +
    "wallet:EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n" +
    "nonce:000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f\n" +
    "expires_at:2026-05-16T23:00:00.000Z",
  publicKeySha256:
    "d666806e11cee19a7c989f7445f90dd419cf4d2d51db8c0fdb4c0f0a542238c9",
  challengeSha256:
    "914bb7b0fd9856750eae6c81e96ec757a779fc0195baf21bbdeb2388cdab809a",
  signedPayloadSha256:
    "bd16d216d7b404f0354cc20bc196eeeb797f16e17783ab2daee610c2ee39a8e4",
} as const;

export interface RouteContract {
  path: string;
  methods: readonly string[];
  contractIds: readonly string[];
}

const route = (
  path: string,
  methods: readonly string[],
  ...contractIds: string[]
): RouteContract => ({ path, methods, contractIds });

// Paths mirror router registrations. Prefix handlers cover their typed subroutes.
export const ROUTE_INVENTORY: readonly RouteContract[] = [
  route("/healthz", ["GET"], "http.health"),
  route("/readyz", ["GET"], "http.readiness"),
  route("/metrics", ["GET"], "admin.internal-metrics"),
  route("/v1/client/version-policy", ["GET"], "client.version-policy"),
  route("/v1/admin/session", ["GET"], "admin.role-auth"),
  route("/v1/admin/status", ["GET"], "admin.role-auth"),
  route("/v1/admin/metrics", ["GET"], "admin.role-auth"),
  route("/v1/auth/wallet/challenge", ["POST"], "auth.challenge"),
  route("/v1/auth/wallet/verify", ["POST"], "auth.mldsa-verify"),
  route("/v1/auth/session/refresh", ["POST"], "auth.refresh-rotation"),
  route("/v1/auth/session/logout", ["POST"], "auth.refresh-revoke"),
  route(
    "/v1/chat/identity-bindings",
    ["POST"],
    "chat.private-identity-binding",
  ),
  route("/v1/account/delete", ["POST"], "account.delete"),
  route("/v1/account/delete/status", ["POST"], "account.delete-status"),
  route("/v1/realtime", ["WEBSOCKET"], "realtime.subscribe-ack-event"),
  route("/v1/chat/sealed/mailboxes", ["GET", "POST"], "relay.mailbox-owner"),
  route("/v1/chat/sealed/messages", ["GET", "POST"], "relay.sealed-message"),
  route("/v1/chat/sealed/messages/delivered", ["POST"], "relay.receipts"),
  route("/v1/chat/sealed/messages/read", ["POST"], "relay.receipts"),
  route("/v1/chat/sealed/messages/delete", ["POST"], "relay.owner-delete"),
  route("/v1/chat/sealed/messages/vacuum", ["POST"], "relay.owner-delete"),
  route("/v1/chat/sealed/receipts", ["POST"], "relay.receipts"),
  route("/v1/chat/bundles", ["POST"], "directory.bundle-owner"),
  route("/v1/chat/bundles/", ["GET", "POST"], "directory.bundle-subroutes"),
  route(
    "/v1/chat/discovery/vdf-challenges",
    ["POST"],
    "directory.vdf-challenge",
  ),
  route(
    "/v1/chat/discovery/leases",
    ["POST"],
    "directory.active-lease",
  ),
  route(
    "/v1/chat/discovery/lease",
    ["GET", "PATCH", "DELETE"],
    "directory.lease-owner",
  ),
  route(
    "/v1/chat/discovery/session-opk",
    ["POST"],
    "directory.session-opk",
  ),
  route(
    "/v1/chat/discovery/aliases",
    ["GET"],
    "directory.alias-search",
  ),
  route("/v1/chat/discovery/", ["GET", "PUT"], "directory.discovery-opt-in"),
  route("/v1/chat/contact-cards", ["POST"], "directory.one-time-contact-card"),
  route(
    "/v1/chat/contact-cards/",
    ["POST"],
    "directory.one-time-contact-card",
    "directory.one-time-contact-card-owner-status",
  ),
  route("/v1/media/consume", ["POST"], "media.participant-consume"),
  route("/v1/media/abandon", ["POST"], "media.sender-abandon"),
  route("/v1/wallet-index/activations", ["POST"], "wallet-index.activation"),
  route(
    "/v1/wallet-index/activations/vdf-challenge",
    ["POST"],
    "wallet-index.activation",
  ),
  route(
    "/v1/wallet-index/activations/complete",
    ["POST"],
    "wallet-index.activation",
  ),
  route("/v1/wallet-index/deliveries", ["GET"], "wallet-index.delivery"),
  route("/v1/wallet-index/deliveries/ack", ["POST"], "wallet-index.delivery"),
  route("/v1/internal/wallet-index/run", ["POST"], "admin.internal-secret"),
  route("/v1/objects/uploads", ["POST"], "objects.signed-upload"),
  route("/v1/objects/finalize", ["POST"], "objects.upload-finalization"),
  route("/v1/objects/downloads", ["POST"], "objects.signed-download"),
  route("/v1/objects/delete", ["POST"], "objects.owner-delete"),
  route("/v1/objects/upload/", ["PUT"], "objects.signed-upload"),
  route("/v1/objects/download/", ["GET"], "objects.signed-download"),
  route("/v1/support/tickets", ["POST"], "support.owner"),
  route("/v1/support/tickets/", ["GET", "POST"], "support.owner"),
  route("/v1/support/staff/tickets/", ["GET", "POST"], "support.staff-role"),
  route("/v1/calls/turn-credentials", ["POST"], "calls.auth"),
  route("/v1/appdata/table", ["POST"], "appdata.policy"),
  route("/v1/groups/epochs/begin", ["POST"], "groups.epoch-owner"),
  route("/v1/groups/epochs/activate", ["POST"], "groups.epoch-owner"),
  route("/v1/groups/epochs/status", ["POST"], "groups.epoch-owner"),
  route("/v1/groups/epochs/pending", ["POST"], "groups.epoch-owner"),
  route("/v1/groups/epochs/claim", ["POST"], "groups.epoch-owner"),
  route("/v1/groups/create", ["POST"], "groups.create-owner"),
  route("/v1/groups/update", ["POST"], "groups.metadata-admin"),
  route("/v1/groups/messages", ["POST"], "groups.message-member"),
  route("/v1/rpc-proxy", ["POST"], "rpc.allowlist"),
  route("/v1/market/prices", ["GET"], "market.public-read"),
  route("/v1/contributions/recipients", ["GET"], "contributions.public-read"),
  route("/v1/agora/", ["GET", "POST"], "agora.bound-identity"),
  route("/v1/spectre/access/", ["POST"], "spectre.access"),
  route("/v1/spectre/activation/", ["POST"], "spectre.activation"),
] as const;

export const APPDATA_POLICY = {
  user_settings: ["select", "insert", "update", "upsert", "delete"],
  notification_tokens: ["select", "insert", "update", "upsert", "delete"],
  notification_token_registrations: [
    "select",
    "insert",
    "update",
    "upsert",
    "delete",
  ],
  call_sessions: ["select", "insert", "update"],
  call_signals: ["select", "insert", "update"],
  chat_groups: ["select", "insert", "update", "delete"],
  chat_group_members: ["select", "insert", "update"],
  chat_group_messages: ["select", "insert"],
  chat_media: ["select", "insert", "update", "delete"],
  messages: ["select", "insert", "update", "delete"],
} as const;

export const STRICT_ERROR_CONTRACTS = {
  invalidJson: { status: 400, body: { error: "invalid_json" } },
  unauthorized: { status: 401, body: { error: "unauthorized" } },
  forbidden: { status: 403, body: { error: "forbidden" } },
  rateLimited: { status: 429, body: { error: "rate_limited" } },
  refreshReplay: { status: 401, body: { error: "refresh_token_replay" } },
  deletionUnavailable: {
    status: 404,
    body: { error: "deletion_status_unavailable" },
  },
} as const;
