<!--
Copyright (c) 2026 MOZAGA FOUNDATION.
SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
See ../../LICENSE.md, ../../LICENSE-AGPL-3.0.txt, and ../../LICENSE-COMMERCIAL.md for details.
-->

# `@spectra/privacy-protocol`

Auditable privacy, wallet-auth, wallet-index activation, push-payload, blind-token, and VDF protocol helpers for Spectra.

## Status

This package is designed to be testable, reviewable, and conservative in its protocol surface. It uses established hashing from `@noble/hashes`, keeps Spectra-specific blind-token, VDF, wallet-index activation, and wallet-auth wire logic in one package, and includes production-sized RSA vectors, VDF parity tests, and negative tests for auditors.

This is an audit-ready production candidate when used with the matching Supabase Edge routes and database replay controls. It is not a substitute for a third-party cryptographic review. Claims stronger than that require external review of the blind-token construction, VDF modulus and timing assumptions, server parity, access-state stores, deterministic account issuance cooldowns, and redemption/nullifier rules.

## Package And Entry Points

The private package is consumed as TypeScript source inside the Spectra monorepo. Its package exports are:

- `@spectra/privacy-protocol`
- `@spectra/privacy-protocol/pushPayload`
- `@spectra/privacy-protocol/spectreBlindToken`
- `@spectra/privacy-protocol/types`
- `@spectra/privacy-protocol/vdf`
- `@spectra/privacy-protocol/walletAuthChallenge`

The root entry point also exports wallet-index activation signing and binding helpers from `walletIndexActivation`. That module is root-only today; it does not have a standalone `@spectra/privacy-protocol/walletIndexActivation` export key.

## Security Goals

The package is intended to provide:

- Spectre blind-token request preparation, finalization, local verification, and nullifier hashing.
- Wesolowski RSA VDF parameter and proof validation, input binding, JavaScript solving/verification, and native-solver bridge helpers for admission and discovery flows.
- Wallet-index activation signing-message construction and VDF binding hashes for supported address-control proofs.
- Domain-separated RSA-FDH account-ticket messages for ephemeral Spectre activation.
- Strict server-issued public-parameter validation for blind-token flows.
- Wallet-auth challenge construction and parsing with a canonical newline-delimited wire format.
- Wallet address, ML-DSA public key, and ML-DSA signature shape validation.
- Metadata-minimizing sealed-message push copy and opaque notification scope/event payload helpers.
- Shared Spectre access TypeScript contracts for application and service code.

Backend clients, SecureStore persistence, Tor lifecycle, access orchestration, timers, UI flows, native VDF execution, wallet-index activation, and server-truth cooldown rules live outside this package, primarily in `services/backend/spectreAccess.ts`, `services/wallet/walletIndexActivation.ts`, `services/tor`, `store/spectreAccessStore.ts`, `services/security/nativeVdf.ts`, `services/security/spectreMode.ts`, and the Supabase Spectre-access/auth modules.

## Non-Goals

The package does not claim:

- A formal symbolic or computational proof for the full Spectra privacy protocol.
- A formally verified or constant-time RSA implementation.
- A proof that a supplied VDF modulus was generated without retained factorization, a uniform delay across devices, or correct server-side challenge policy enforcement.
- Standalone anonymity if server-side issuance, redemption, wallet binding, or database controls are misconfigured.
- Protection after full device compromise while activation tokens or wallet material are available in application memory.
- ML-DSA signing or verification. The app signs wallet-auth challenges through `@spectra/identity-vault`; `supabase/functions/_shared/auth.ts` verifies them and enforces challenge replay state.
- Server-side replay prevention or quota enforcement. These are enforced by backend stores and database constraints.
- Transport privacy, Tor circuit privacy, notification-service privacy, or local key-storage security.
- Standalone npm distribution readiness; the package is currently consumed as TypeScript source in the Spectra monorepo.

## Primitive Choices

- SHA-256 from `@noble/hashes` provides FDH expansion and nullifier hashing.
- `crypto.getRandomValues` provides blind-token nullifiers and RSA blinding factors.
- RSA-FDH v1 is used for Spectre blind activation tokens.
- `wesolowski-rsa-v1` provides public RSA-group VDF proof helpers, JavaScript reference solving/verification, and native-solver bridge material.
- JavaScript `bigint` arithmetic implements modular exponentiation, modular inverse, gcd checks, RSA representative handling, and VDF proof handling.
- ML-DSA-65 public key and signature byte lengths are validated for wallet-auth payload shape checks.
- Wallet-auth challenge text uses `TextEncoder` semantics through the signing/verifying runtimes.

The JavaScript `bigint` RSA arithmetic is not constant-time. It is used for client-side blinding, unblinding, public verification, and VDF operations over public values, not for holding server private key material in the app package. VDF verification establishes the mathematical relation for public inputs; it does not establish how long a prover actually waited or whether a supplied modulus has an unknown factorization.

## Blind-Token Model

The blind-signature construction lets a root wallet request a server signature without exposing the unblinded activation message during issuance. It prevents the redeemed token contents alone from identifying which blinded request was signed. Root issuance and ephemeral Spectre redemption use different wallet-derived backend user IDs, and the current schema contains no explicit root-to-Spectre relationship. The backend does, however, retain root-keyed issuance cooldown/timing records and Spectre-keyed redemption/timing records and can observe request timing and network metadata. The cryptographic token is therefore blind, but the complete deployed flow does not claim strong operational unlinkability against the backend.

For the expendable flow, the app generates a fresh random-mnemonic Spectre keypair locally after the user explicitly selects that mode and before requesting the blind signature. This is necessary because the blinded token message is already bound to the new Spectre address. Redemption does not generate the keypair: it activates that previously generated address in backend Spectre access state. Before redemption, the private key and finalized token remain client-side, with the token stored in SecureStore. The wallet is first added to the local vault; immediately before redemption, wallet authentication exposes and binds its Spectre address and public key to its wallet-derived backend user. The address enters active Spectre access state only when redemption succeeds.

The server is trusted to:

- Publish the correct `SpectreBlindPublicParams`.
- Protect the RSA private exponent.
- Sign only well-formed blinded messages after the authenticated root wallet passes access checks and the blinded RSA payload is validated.
- Enforce ephemeral Spectre token issuance intervals and replay controls.
- Require the supplied redemption wallet to be bound to its own authenticated, wallet-derived backend user.
- Store nullifier hashes to prevent replay.

The client treats blind-token public params as server-issued configuration and rejects:

- Unsupported algorithms.
- Unexpected domains.
- Empty key ids.
- RSA moduli smaller than 2048 bits.
- Even or too-small RSA moduli.
- Public exponents other than `65537`.
- Token signatures outside the RSA modulus range.

## VDF Work-Proof Model

The package exposes `wesolowski-rsa-v1` helpers for VDF proofs used by wallet admission, public discovery, discovery extension, session OPK claims, contact cards, and wallet-index activation. Inputs bind a `vdfc1.` challenge ID, a 32-byte nonce, an action, and a SHA-256 binding hash. Parameters require the exact `spectra.discovery.vdf.v1` domain, an odd modulus encoded in 256 to 1024 bytes, a bounded iteration count, and a valid parameter ID.

`solveVdf` supplies a JavaScript reference solver and fallback for non-native environments. `prepareVdfNativeEvaluation`, `deriveVdfNativeProofPrime`, and `createVdfProofFromNativeResult` let the mobile native module perform the public modular arithmetic while preserving the same wire format. The app integration requires its native `VdfModule` on iOS and Android and uses the JavaScript solver outside those platforms.

The helpers do not validate that a server-selected modulus has unknown order, prove a uniform elapsed delay across hardware, issue challenges, or persist replay state. Backend routes must govern parameter publication, challenge age and expiry, action/resource binding, and one-time consumption.

## Protocol Constants

- Blind-token algorithm: `rsa-fdh-v1`
- Blind-token message domain prefix: `spectra.mobile.account-ticket.v1`
- Purpose-specific blind-token domain: `spectra.mobile.account-ticket.v1.spectre_ephemeral`
- FDH expansion domain: `spectra.mobile.spectre.activate.fdh.v1`
- Nullifier hash domain: `spectra.mobile.spectre.activate.nullifier.v1`
- VDF algorithm: `wesolowski-rsa-v1`
- VDF domain: `spectra.discovery.vdf.v1`
- Wallet-auth purpose line: `EXO wallet auth`
- Wallet-auth version: `1`
- Wallet-auth TTL: issued and enforced outside this package by `supabase/functions/_shared/auth.ts`; the current value is 5 minutes.
- Wallet-auth nonce: 32 bytes encoded as 64 lowercase hexadecimal characters

The FDH expansion domain is intentionally separate from the blind-token message domain. Auditors should treat this as explicit domain separation, not as a mismatch.

The mobile app and backend only issue and redeem the `spectre_ephemeral` purpose. Deterministic persistent Spectre and transparent EXO accounts are derived locally and register with the backend only when active; they do not use blind-token activation.

## Blind-Token Flow

1. The app fetches `SpectreBlindPublicParams` without authentication from `POST /v1/spectre/activation/params?ticketPurpose=<purpose>`.
2. `prepareSpectreBlindTokenRequest` validates params, normalizes the EXO wallet address, generates a 32-byte nullifier, hashes the canonical message to an RSA representative, samples an invertible blinding factor, and returns the blinded message plus local token state.
3. `POST /v1/spectre/activation/issue` authenticates the root wallet's wallet-derived backend user, validates the blinded message, consumes the root-keyed 24-hour issuance cooldown, then returns a blind signature for a valid blinded message.
4. `finalizeSpectreBlindToken` unblinds the signature and verifies the resulting activation token before returning it.
5. After the app switches to the Spectre wallet and establishes that wallet's separate backend session, `POST /v1/spectre/activation/redeem` receives `keyId`, `ticketPurpose`, `nullifierHex`, `signatureHex`, `isEphemeral`, and `walletAddress`, requires that wallet to be bound to its own authenticated backend user, verifies the token, stores the redemption/nullifier record, and activates the Spectre address.

## Wallet-Auth Challenge Format

Challenges are newline-delimited text:

```text
EXO wallet auth
version:1
uid:<backend-user-id>
wallet:<canonical-EXO-address>
nonce:<64-hex-characters>
expires_at:<ISO-8601-timestamp>
```

Builders normalize accepted EXO address casing into canonical `EXO00` plus lowercase hexadecimal suffix. Parsers reject duplicate fields, unknown fields, non-canonical wallet addresses, malformed nonces, invalid timestamps, and unsupported versions.

The package validates wallet-auth public key and signature shapes, but it does not verify ML-DSA signatures. Signature verification and challenge replay protection live in the Supabase Edge auth module and Postgres stores.

## Push Payload Metadata Model

`pushPayload.ts` builds generic notification copy and does not embed message content, wallet addresses, conversation IDs, message IDs, public names, or remote identity IDs. Current sealed-message wakeups contain exactly two validated opaque identifiers:

- `notificationScopeId`, formatted as `nsc1.` followed by 32 lowercase hexadecimal characters
- `notificationEventId`, formatted as `nev1.` followed by 32 lowercase hexadecimal characters

`buildSealedMessagePushPayload` rejects malformed identifiers. Its default English copy is title `Spectra` and body `New encrypted message`; callers may pass other generic copy. Supabase Edge uses the same opaque identifier rules and selects localized generic bodies rather than always emitting the English default. `normalizeSealedMessagePushData` accepts only payloads containing both valid opaque identifiers. `isLegacySealedMessagePushData` recognizes only the rollout-era type-only payload `{ type: "sealed_direct_message" }`; it does not accept legacy wallet or message routing fields.

Opaque identifiers minimize exposed semantics but are not cryptographic protections. Treat them as application-visible push metadata that may be observed by the OS, notification services, backups, and other platform surfaces.

## Versioning And Compatibility Model

- Blind-token params must use `rsa-fdh-v1`.
- Wallet-auth challenges must use version `1`.
- Unsupported future algorithms or challenge versions are rejected rather than silently accepted.
- Token verifiers return `false` for malformed untrusted token fields. `finalizeSpectreBlindToken` is stricter and may throw on malformed signer responses or corrupted local prepared state.
- Invalid public params throw because they represent configuration errors, not token-authentication failures.
- Supabase Edge maintains parallel blind-token, VDF, wallet-index activation, and wallet-auth implementations rather than importing this package; their wire contracts must stay synchronized with this package.
- Blind-token params use the purpose-scoped `spectra.mobile.account-ticket.v1.spectre_ephemeral` domain.
- VDF params and proofs must use `wesolowski-rsa-v1` and `spectra.discovery.vdf.v1`; malformed proofs return `false` from the verifier.

## Runtime Assumptions

- `crypto.getRandomValues` and `TextEncoder` are available in the React Native / Expo runtime.
- `supabase/functions/_shared/spectreAccess.ts`, `supabase/functions/_shared/auth.ts`, `supabase/functions/_shared/vdf.ts`, and `supabase/functions/_shared/walletIndexActivation.ts` implement matching blind-token, wallet-auth, VDF, and wallet-index activation wire formats.
- Public blind-token params are fetched from trusted Spectra backend routes under `/v1/spectre/activation/`.
- The package is consumed as TypeScript source inside the Spectra monorepo. It is private and is not currently packaged as a standalone compiled npm artifact.

## Test And Audit Posture

The test suite is intended to be auditor-oriented. It includes:

- production-sized RSA blind-token round-trip vectors using a dedicated test RSA key (`keyId: test-key`), not production signing material
- blinded-message finalization and local verification tests
- tampered wallet, nullifier, signature, and key-id rejection tests
- malformed token-field tests that assert verifier failure instead of uncaught exceptions
- unsupported algorithm, wrong domain, empty key id, tiny modulus, even modulus, and wrong exponent tests
- nullifier hash stability and malformed-nullifier tests
- VDF JavaScript/Edge parity, native-solver bridge, action/resource-binding, malformed-parameter, and altered-proof tests
- wallet-auth challenge build/parse round-trip tests
- wallet-auth casing, nonce, duplicate-field, unknown-field, missing-field, invalid-expiry, and unsupported-version tests
- push identifier format, opaque payload construction, malformed-routing rejection, and type-only legacy wakeup tests

Wallet-index activation signing and binding tests live in `services/wallet/walletIndexActivation.test.ts` and Supabase contract tests rather than this package's local test directory.

From the Spectra repository root:

```sh
npm run test:privacy-protocol
npm run test -- --run
npm run lint
npm run typecheck
npm run typecheck:tests
```

Auditors should review this package together with:

- `supabase/functions/_shared/spectreAccess.ts`
- `supabase/functions/_shared/auth.ts`
- `supabase/functions/_shared/vdf.ts`
- `supabase/functions/_shared/walletIndexActivation.ts`
- `supabase/functions/_shared/router.ts`
- `supabase/migrations/20260727182649_wallet_auth.sql`
- `supabase/migrations/20260728224734_free_spectre_access_and_retire_remote_archives.sql`
- `supabase/migrations/20260727183345_atomic_rpcs.sql`
- `supabase/migrations/20260727183437_rls_and_privileges.sql`
- `supabase/migrations/20260801153221_ephemeral_vdf_discovery.sql`
- `supabase/migrations/20260902120000_vdf_rented_discovery.sql`
- `services/wallet/walletIndexActivation.test.ts`
- `supabase/tests/wallet_index_activation_test.ts`
