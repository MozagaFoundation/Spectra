import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import { assert, assertEquals, assertRejects, assertThrows } from "./assert.ts";
import { ML_DSA_INTEROP } from "./fixtures/contracts.ts";
import {
  type AccessClaims,
  buildWalletChallenge,
  parseStrictJsonObject,
  parseWalletChallenge,
  sha256Hex,
  signAccessToken,
  verifyAccessToken,
  walletAuthSignedPayload,
} from "./helpers/protocol.ts";

Deno.test("ML-DSA-65 fixture interoperates with the Edge and mobile protocol", async () => {
  const { publicKey, secretKey } = ml_dsa65.keygen(ML_DSA_INTEROP.seed);
  const payload = walletAuthSignedPayload(ML_DSA_INTEROP.challenge);
  const signature = ml_dsa65.sign(payload, secretKey);

  assertEquals(publicKey.length, 1952);
  assertEquals(secretKey.length, 4032);
  assertEquals(signature.length, 3309);
  assertEquals(await sha256Hex(publicKey), ML_DSA_INTEROP.publicKeySha256);
  assertEquals(
    await sha256Hex(ML_DSA_INTEROP.challenge),
    ML_DSA_INTEROP.challengeSha256,
  );
  assertEquals(await sha256Hex(payload), ML_DSA_INTEROP.signedPayloadSha256);
  assert(
    ml_dsa65.verify(signature, payload, publicKey),
    "valid ML-DSA signature rejected",
  );

  const tampered = walletAuthSignedPayload(
    ML_DSA_INTEROP.challenge.replace("uid:user-1", "uid:user-2"),
  );
  assert(
    !ml_dsa65.verify(signature, tampered, publicKey),
    "tampered challenge accepted",
  );
  assert(
    !ml_dsa65.verify(
      signature,
      new TextEncoder().encode(ML_DSA_INTEROP.challenge),
      publicKey,
    ),
    "raw, non-domain-separated challenge accepted",
  );
});

Deno.test("wallet challenge canonicalization is exact and injection-safe", () => {
  const challenge = buildWalletChallenge({
    userId: "user-1",
    walletAddress: " exo00ABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFAB ",
    nonce: "00112233445566778899AABBCCDDEEFF00112233445566778899AABBCCDDEEFF",
    expiresAt: "2026-05-16T19:00:00.123Z",
  });
  assertEquals(
    challenge,
    "EXO wallet auth\n" +
      "version:1\n" +
      "uid:user-1\n" +
      "wallet:EXO00abcdefabcdefabcdefabcdefabcdefabcdefab\n" +
      "nonce:00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff\n" +
      "expires_at:2026-05-16T19:00:00.123Z",
  );
  assertEquals(parseWalletChallenge(challenge), {
    version: "1",
    userId: "user-1",
    walletAddress: "EXO00abcdefabcdefabcdefabcdefabcdefabcdefab",
    nonce: "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
    expiresAt: "2026-05-16T19:00:00.123Z",
  });

  for (
    const malformed of [
      `${challenge}\n`,
      challenge.replace("version:1", "version:2"),
      challenge.replace("uid:user-1", "uid:user-1\nuid:user-2"),
      challenge.replace("wallet:EXO00", "wallet:exo00"),
      challenge.replace("nonce:0011", "scope:any\nnonce:0011"),
      challenge.replace("2026-05-16T19:00:00.123Z", "not-a-date"),
    ]
  ) {
    assertEquals(
      parseWalletChallenge(malformed),
      null,
      `accepted malformed challenge: ${malformed}`,
    );
  }

  assertThrows(() =>
    buildWalletChallenge({
      userId: "user\nadmin",
      walletAddress: "EXO00abcdefabcdefabcdefabcdefabcdefabcdefab",
      nonce: "00".repeat(32),
      expiresAt: "2026-05-16T19:00:00.000Z",
    }), /user id/u);
});

Deno.test("EdDSA JWT contract enforces claims, expiry, and tamper resistance", async () => {
  const keys = await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ]);
  const now = 1_779_000_000;
  const claims: AccessClaims = {
    iss: "spectra-api",
    aud: "spectra-mobile",
    sub: "user-1",
    sid: "session-1",
    wallet: "EXO00abcdefabcdefabcdefabcdefabcdefabcdefab",
    identity_id: "identity-1",
    iat: now,
    exp: now + 900,
  };
  const token = await signAccessToken(keys.privateKey, claims, "2026-07");
  assertEquals(
    await verifyAccessToken(
      token,
      keys.publicKey,
      "spectra-api",
      "spectra-mobile",
      now,
    ),
    claims,
  );

  const parts = token.split(".");
  const tamperedSignature = `${parts[0]}.${parts[1]}.${flip(parts[2]!)}`;
  await assertRejects(
    () =>
      verifyAccessToken(
        tamperedSignature,
        keys.publicKey,
        "spectra-api",
        "spectra-mobile",
        now,
      ),
    /invalid_access_token/u,
  );
  const wrongIssuer = await signAccessToken(keys.privateKey, {
    ...claims,
    iss: "attacker",
  });
  const expired = await signAccessToken(keys.privateKey, {
    ...claims,
    iat: now - 901,
    exp: now - 1,
  });
  const future = await signAccessToken(keys.privateKey, {
    ...claims,
    iat: now + 61,
    exp: now + 961,
  });
  const extraClaim = await signAccessToken(
    keys.privateKey,
    { ...claims, role: "service_role" } as AccessClaims,
  );
  for (const invalid of [wrongIssuer, expired, future, extraClaim, "one.two"]) {
    await assertRejects(
      () =>
        verifyAccessToken(
          invalid,
          keys.publicKey,
          "spectra-api",
          "spectra-mobile",
          now,
        ),
      /invalid_access_token/u,
    );
  }
});

Deno.test("strict JSON accepts one bounded object and rejects ambiguity", () => {
  assertEquals(
    parseStrictJsonObject('{"refreshToken":"opaque"}', ["refreshToken"]),
    { refreshToken: "opaque" },
  );
  for (
    const body of [
      '{"refreshToken":"opaque","userId":"attacker"}',
      '{"refreshToken":"opaque"} {}',
      "[]",
      "null",
    ]
  ) {
    assertThrows(
      () => parseStrictJsonObject(body, ["refreshToken"]),
      /json|field/u,
    );
  }
  assertThrows(
    () => parseStrictJsonObject(`{"value":"${"a".repeat(65)}"}`, ["value"], 64),
    /request_too_large/u,
  );
});

function flip(value: string): string {
  const first = value[0] ?? "A";
  return `${first === "A" ? "B" : "A"}${value.slice(1)}`;
}
