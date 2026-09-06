const encoder = new TextEncoder();
const decoder = new TextDecoder();
const WALLET_PATTERN = /^EXO00[0-9a-f]{38}$/;
const NONCE_PATTERN = /^[0-9a-f]{64}$/;
const JWT_CLAIMS = new Set([
  "iss",
  "aud",
  "sub",
  "sid",
  "wallet",
  "identity_id",
  "iat",
  "exp",
]);

export interface WalletChallenge {
  version: "1";
  userId: string;
  walletAddress: string;
  nonce: string;
  expiresAt: string;
}

export interface AccessClaims {
  iss: string;
  aud: string;
  sub: string;
  sid: string;
  wallet: string;
  identity_id?: string;
  iat: number;
  exp: number;
}

export function normalizeWalletAddress(value: string): string {
  const trimmed = value.trim();
  if (!/^exo00[0-9a-f]{38}$/i.test(trimmed)) {
    throw new Error("invalid wallet address");
  }
  return `EXO00${trimmed.slice(5).toLowerCase()}`;
}

export function buildWalletChallenge(input: {
  userId: string;
  walletAddress: string;
  nonce: string;
  expiresAt: string | Date;
}): string {
  const userId = input.userId.trim();
  const nonce = input.nonce.trim().toLowerCase();
  const expiresAt = input.expiresAt instanceof Date
    ? input.expiresAt.toISOString()
    : input.expiresAt;
  if (!isSafeField(userId)) {
    throw new Error("invalid user id");
  }
  if (!NONCE_PATTERN.test(nonce)) throw new Error("invalid nonce");
  if (!Number.isFinite(Date.parse(expiresAt))) {
    throw new Error("invalid expiration");
  }
  return [
    "EXO wallet auth",
    "version:1",
    `uid:${userId}`,
    `wallet:${normalizeWalletAddress(input.walletAddress)}`,
    `nonce:${nonce}`,
    `expires_at:${expiresAt}`,
  ].join("\n");
}

export function parseWalletChallenge(
  challenge: string,
): WalletChallenge | null {
  const lines = challenge.split("\n");
  if (lines.length !== 6 || lines[0] !== "EXO wallet auth") return null;
  const allowed = new Set(["version", "uid", "wallet", "nonce", "expires_at"]);
  const values = new Map<string, string>();
  for (let index = 0; index < 5; index++) {
    const line = lines[index + 1];
    if (line === undefined) return null;
    const separator = line.indexOf(":");
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (separator < 1 || !allowed.has(key) || values.has(key) || !value) {
      return null;
    }
    values.set(key, value);
  }
  const userId = values.get("uid") ?? "";
  const walletAddress = values.get("wallet") ?? "";
  const nonce = values.get("nonce") ?? "";
  const expiresAt = values.get("expires_at") ?? "";
  if (
    values.get("version") !== "1" ||
    !isSafeField(userId) ||
    !WALLET_PATTERN.test(walletAddress) ||
    !NONCE_PATTERN.test(nonce)
  ) return null;
  if (!Number.isFinite(Date.parse(expiresAt))) return null;
  return { version: "1", userId, walletAddress, nonce, expiresAt };
}

function isSafeField(value: string): boolean {
  return value.length > 0 &&
    [...value].every((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint >= 0x20 && codePoint !== 0x7f;
    });
}

export function walletAuthSignedPayload(challenge: string): Uint8Array {
  if (!parseWalletChallenge(challenge)) throw new Error("invalid challenge");
  return encoder.encode(`Spectra.WalletAuthChallenge.v1\u0000${challenge}`);
}

export async function sha256Hex(value: Uint8Array | string): Promise<string> {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", ownedBuffer(bytes));
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function parseStrictJsonObject(
  body: string,
  allowedKeys: readonly string[],
  maxBytes = 64 * 1024,
): Record<string, unknown> {
  if (encoder.encode(body).byteLength > maxBytes) {
    throw new Error("request_too_large");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("invalid_json");
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("invalid_json");
  }
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(parsed)) {
    if (!allowed.has(key)) throw new Error("unknown_field");
  }
  return parsed as Record<string, unknown>;
}

export async function signAccessToken(
  privateKey: CryptoKey,
  claims: AccessClaims,
  keyId?: string,
): Promise<string> {
  validateClaims(
    claims,
    claims.iss,
    claims.aud,
    claims.iat,
    Number.POSITIVE_INFINITY,
  );
  const header = keyId
    ? { alg: "EdDSA", typ: "JWT", kid: keyId }
    : { alg: "EdDSA", typ: "JWT" };
  const unsigned = `${encodeJson(header)}.${encodeJson(claims)}`;
  const signature = await crypto.subtle.sign(
    "Ed25519",
    privateKey,
    encoder.encode(unsigned),
  );
  return `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifyAccessToken(
  token: string,
  publicKey: CryptoKey,
  expectedIssuer: string,
  expectedAudience: string,
  nowSeconds: number,
  clockSkewSeconds = 60,
): Promise<AccessClaims> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new Error("invalid_access_token");
  }
  const [encodedHeader, encodedClaims, encodedSignature] = parts as [
    string,
    string,
    string,
  ];
  const header = decodeJson(encodedHeader);
  const headerKeys = Object.keys(header);
  if (
    header.alg !== "EdDSA" ||
    header.typ !== "JWT" ||
    headerKeys.some((key) => !["alg", "typ", "kid"].includes(key))
  ) throw new Error("invalid_access_token");
  const verified = await crypto.subtle.verify(
    "Ed25519",
    publicKey,
    base64UrlDecode(encodedSignature),
    encoder.encode(`${encodedHeader}.${encodedClaims}`),
  );
  if (!verified) throw new Error("invalid_access_token");
  const rawClaims = decodeJson(encodedClaims);
  if (Object.keys(rawClaims).some((key) => !JWT_CLAIMS.has(key))) {
    throw new Error("invalid_access_token");
  }
  const claims = rawClaims as unknown as AccessClaims;
  validateClaims(
    claims,
    expectedIssuer,
    expectedAudience,
    nowSeconds,
    clockSkewSeconds,
  );
  return claims;
}

function validateClaims(
  claims: AccessClaims,
  issuer: string,
  audience: string,
  nowSeconds: number,
  clockSkewSeconds: number,
): void {
  if (
    claims.iss !== issuer ||
    claims.aud !== audience ||
    typeof claims.sub !== "string" || !claims.sub ||
    typeof claims.sid !== "string" || !claims.sid ||
    typeof claims.wallet !== "string" || !WALLET_PATTERN.test(claims.wallet) ||
    !Number.isSafeInteger(claims.iat) ||
    !Number.isSafeInteger(claims.exp) ||
    claims.exp <= claims.iat ||
    claims.iat > nowSeconds + clockSkewSeconds ||
    claims.exp <= nowSeconds
  ) throw new Error("invalid_access_token");
  if (
    "identity_id" in claims &&
    (typeof claims.identity_id !== "string" || !claims.identity_id)
  ) {
    throw new Error("invalid_access_token");
  }
}

function encodeJson(value: unknown): string {
  return base64UrlEncode(encoder.encode(JSON.stringify(value)));
}

function decodeJson(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(decoder.decode(base64UrlDecode(value)));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error();
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error("invalid_access_token");
  }
}

function base64UrlEncode(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(
    /=+$/u,
    "",
  );
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("invalid_access_token");
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  try {
    const binary = atob(padded);
    const result = new Uint8Array(new ArrayBuffer(binary.length));
    for (let index = 0; index < binary.length; index++) {
      result[index] = binary.charCodeAt(index);
    }
    return result;
  } catch {
    throw new Error("invalid_access_token");
  }
}

function ownedBuffer(value: Uint8Array): ArrayBuffer {
  const result = new ArrayBuffer(value.byteLength);
  new Uint8Array(result).set(value);
  return result;
}
