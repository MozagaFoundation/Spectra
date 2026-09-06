<!--
Copyright (c) 2026 MOZAGA FOUNDATION.
SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
See ../../LICENSE.md, ../../LICENSE-AGPL-3.0.txt, and ../../LICENSE-COMMERCIAL.md for details.
-->

# Spectra Core Crypto

Auditable cryptography and end-to-end messaging primitives for Spectra.

## Status

This package is designed to be testable, reviewable, and conservative in its use of primitives. The implementation uses established primitives from `@noble/*` packages and keeps protocol-specific composition code in this package so that reviewers can inspect it directly. On iOS and Android, ML-KEM-768 keygen/encaps/decaps and chat-identity ML-DSA-65 verify/sign offload to native PQClean modules in `native/mlkem-core` and `native/mldsa-core`; `@noble/post-quantum` remains the JavaScript oracle and fallback. Wallet and vault ML-DSA keys are not signed natively; those stay in `@spectra/identity-vault`. In the current monorepo layout, this is a private workspace package (`"private": true`, version `0.1.0`) and those JavaScript dependencies are declared at the workspace root rather than in this leaf package's `package.json`.

## Package And Entry Points

The package name is `@spectra/core-crypto`. Public entry points are exported from `package.json`:

- `@spectra/core-crypto`
- `@spectra/core-crypto/client/*`
- `@spectra/core-crypto/crypto/*`
- `@spectra/core-crypto/server/*`
- `@spectra/core-crypto/storage/*`
- `@spectra/core-crypto/types`

The main app integration surface is `QuantumChat` from `src/index.ts`; lower-level subpaths expose auditable primitives and storage/server contracts. The root entry point intentionally exports more than the high-level client. `package.json` is the authoritative package boundary. `src/index.ts` is the root-export surface for identity/session helpers, TOFU helpers, storage/server adapters, safety numbers, X3DH bundle maintenance, sealed envelopes, message-lifecycle and compact-transport helpers, BLE v2 helpers, media/call helpers, wallet authorization helpers, protocol versions, and shared types. Subpath imports are for concrete modules such as `@spectra/core-crypto/crypto/x3dh`; there is no standalone `@spectra/core-crypto/client` export key without a concrete file path. BLE is currently exported from the root entry point rather than a `@spectra/core-crypto/ble/*` package subpath.

Signatures use ML-DSA-65 (`ml_dsa65`), the FIPS 204 standardized algorithm based on CRYSTALS-Dilithium. Some code identifiers and root exports still use the historical `dilithium*` naming for compatibility.

## Security Goals

The package is intended to provide:

- End-to-end confidentiality for message contents, media payloads, call signaling, and RTP-style call payloads.
- Message authentication and tamper detection using AEAD and ML-DSA signatures where applicable.
- Forward secrecy and post-compromise recovery for chat sessions through a Double Ratchet style construction.
- Hybrid classical and post-quantum key agreement for initial sessions using X25519 and ML-KEM-768.
- Post-quantum identity authentication using ML-DSA-65 bundle and signed pre-key signatures.
- Replay protection for messages, signed control messages, call signaling, and RTP-style call packets.
- Versioned BLE route capabilities; HMAC-SHA256-authenticated route envelopes, fragments, and acceptance receipts; ML-DSA-authenticated X25519 credentials; and an opt-in bounded in-memory envelope replay cache.
- Monotonic local message lifecycle handling for sender-side delivery/read receipt state.
- Encryption at rest for local sensitive records when storage encryption is enabled.
- Explicit protocol and storage version checks to avoid silent downgrade or incompatible future-format parsing.

The package reduces relay-visible metadata through sealed relay/control envelopes. `BackendBundleServer` uses sealed relay HTTP routes and exposes no unsealed relay/control or legacy per-mailbox-fetch client methods. Server schema, retention, and access-policy guarantees are deployment concerns documented with the backend. Delivery/read receipts are sealed-only relay metadata keyed by the relay row id and do not store inner message IDs. The signed bundle capability label `legacy_v1` is retained as the stable default-mailbox wire name and does not imply an unsealed relay path; scoped mailboxes use `scoped_v2`. The current sealed envelope wire versions are `sealedRelayEnvelope: 1` and `sealedControlEnvelope: 1`. See [Metadata Leakage Model](#metadata-leakage-model).

## Non-Goals

The package does not claim:

- A formal symbolic or computational proof for the custom hybrid protocol.
- Anonymity against the relay/server.
- Protection after full device compromise while keys are unlocked in memory.
- Protection for data intentionally exposed by the application UI or operating system notifications.

## Primitive Choices

- X25519 provides classical elliptic-curve Diffie-Hellman.
- ML-KEM-768 provides post-quantum key encapsulation. iOS and Android may offload keygen, encaps, and decaps to `NativeModules.MlKemModule`; the JavaScript `@noble/post-quantum` implementation remains the oracle and fallback.
- ML-DSA-65 provides post-quantum signatures for bundle, message, and call-signaling authentication. iOS and Android may offload chat-identity verify and sign to `NativeModules.MlDsaModule`. Wallet and vault Dilithium keys stay in JavaScript.
- AES-256-GCM provides authenticated encryption for messages, media, storage payloads, call signaling, and SRTP-like packet wrapping.
- HKDF-SHA256 and HMAC-SHA256 provide domain-separated key derivation for X3DH outputs, ratchets, call keys, and related key schedules.
- SHA-256 is also used for session fingerprints, safety-number material, transcript hashes, sealed mailbox/thread tokens, and other non-secret hashes.
- PBKDF2-HMAC-SHA256 is used for password-derived storage keys with versioned KDF metadata.
- Keccak-256 is used for EXO wallet-address derivation in wallet-authorized chat bundle publishing.

## Call Media Scope

The package exports RTP-style helper functions from `src/crypto/call.ts`, but the mobile application's live media path uses WebRTC DTLS-SRTP. Those helper functions are not wired into the app's production media transport. Initial hybrid post-quantum chat establishment therefore must not be described as post-quantum encryption of live call media.

## PQXDH Composition Rationale

Initial session establishment is a hybrid X3DH-like exchange implemented in [`src/crypto/x3dh.ts`](src/crypto/x3dh.ts). The shared secret is derived from both:

- X25519 DH outputs for classical security and compatibility with X3DH-style transcript reasoning.
- ML-KEM shared secrets for post-quantum resistance.

The KDF input concatenates post-quantum KEM material followed by classical DH material (`KEM || DH`), then derives the final shared secret with domain-separated HKDF. The intended security property is hybrid robustness: the initial shared secret should remain confidential if either the classical X25519 side or the ML-KEM side remains secure. This is an engineering goal of the composition, not a formal proof.

Associated data binds:

- initiator X25519 identity key
- initiator ML-DSA identity key
- responder X25519 identity key
- responder ML-DSA identity key
- responder ML-KEM identity key
- initiator ephemeral X25519 key
- signed pre-key and one-time pre-key IDs
- ML-KEM ciphertext hash

One-time pre-keys are not individually signed in the current wire type. The static bundle and signed pre-key are signed, while the OPK array is intentionally excluded from the static bundle signature so server-side OPK allocation and removal do not invalidate the static bundle signature. OPK IDs and public keys are still bound into the X3DH transcript; an OPK substitution should cause bootstrap failure rather than reveal the initial secret without the responder's signed pre-key or identity private keys.

Inbound X3DH bootstrap is only accepted when the initiator identity and ML-DSA keys carried in the bootstrap data match the locally stored sender bundle. The first message is then verified against the session-bound ML-DSA key, not an arbitrary caller-supplied key.

Previous signed pre-keys are retained temporarily for delayed first messages. A responder uses the signed pre-key ID from the X3DH bootstrap to find the matching retained private key for both the X3DH secret and the initial responder ratchet state.

## Ratchet Design

The message uses a Double Ratchet Design in [`src/crypto/ratchet.ts`](src/crypto/ratchet.ts):

- root keys advance through DH ratchet steps
- sending and receiving chain keys advance per message
- skipped message keys support out-of-order delivery
- skipped keys expire and are best-effort zeroed within JavaScript runtime limits
- message headers can be encrypted with header keys derived from ratchet DH outputs

Messages are signed over normalized metadata, normalized header fields, ciphertext, nonce, and tag. AEAD associated data uses the same normalized metadata and header fields so delayed/skipped-key decrypts authenticate the same transcript as in-order decrypts. When session-level associated data is supplied, it is prepended to AEAD associated data; it is authenticated by GCM but is not part of the ML-DSA signature input. As a result, optional session-level associated data is an AEAD integrity binding, not a signer-intent or non-repudiation binding.

## Downgrade And Versioning Model

Chat, storage, and sealed-envelope wire versions are listed in [`src/crypto/protocolVersion.ts`](src/crypto/protocolVersion.ts). BLE v2 also records the same numeric values independently as `BLE_V2_PROTOCOL_VERSION` in [`src/ble/constants.ts`](src/ble/constants.ts):

- `x3dhHeader: 1`
- `doubleRatchetMessage: 3`
- `callSignal: 1`
- `sealedRelayEnvelope: 1`
- `sealedControlEnvelope: 1`
- `relayMailboxToken: 1`
- `scopedRelayMailboxToken: 2`
- `storagePayload: 1`
- `storageKdf: 1`
- `bleRouteCapability: 2`
- `bleRouteEnvelope: 2`
- `bleFragment: 2`
- `bleAcceptanceReceipt: 2`
- `bleX25519Credential: 2`

Current wire decoders for X3DH headers, Double Ratchet messages, call signals, and sealed envelopes require the exact supported version and reject missing, invalid, or future versions. BLE v2 codecs enforce `BLE_V2_PROTOCOL_VERSION` from the BLE constants module. Storage payload and storage KDF metadata parsing uses a softer compatibility check: missing versions are accepted as legacy records, invalid versions and future versions are rejected, and versions from `1` through the current supported storage version are accepted. Ratchet session-state schema versioning is maintained locally in [`src/crypto/ratchet.ts`](src/crypto/ratchet.ts), not in the shared wire-version table.

Versioning goals:

- Prevent silent parsing of future incompatible wire formats.
- Make wire-format changes explicit in code and tests.
- Keep backwards compatibility limited to known legacy records.
- Avoid downgrade behavior where a sender can force weaker wire semantics without an explicit compatibility path.

## BLE v2 Transport Foundation

The root entry point exports the BLE protocol and cryptographic foundation from [`src/ble`](src/ble). It provides:

- versioned route-capability creation, validation, encoding, and decoding
- HMAC-SHA256-authenticated route-envelope creation and verification
- HMAC-SHA256-authenticated fragmentation, fragment verification, and reassembly
- HMAC-SHA256-authenticated acceptance-receipt creation and verification
- ML-DSA-authenticated X25519 static credentials
- Noise XX adapter contracts, handshake-material validation, and a domain-separated prologue
- an opt-in `BleEnvelopeReplayCache` helper for bounded in-memory envelope replay detection

The package does not include a Noise XX handshake implementation; integrations provide a `BleNoiseXXAdapter`. These helpers secure and encode nearby-transport records; discovery, radio permissions, connection lifecycle, foreground gating, persistence, and app routing live in the app's `services/bluetooth/` layer. The replay cache is not automatically applied by the codecs and must be integrated explicitly. Integrations still need durable higher-level deduplication where replay protection must survive process restart.

## Metadata Leakage Model

The package protects message contents and cryptographic transcripts, but it does not hide all metadata.

Expected visible or locally indexed metadata includes:

- identity IDs needed for local contact/session lookup
- local conversation IDs and message IDs
- timestamps and sequence numbers needed for ordering and replay protection
- relay/server routing fields on historical legacy relay records
- opaque mailbox tokens, delivery class, server sequence, timestamps, delivery token, and push-notification flag on the sealed relay path
- RTP-style call headers authenticated as associated data
- local storage lookup keys and minimal index fields needed by IndexedDB/localStorage
- local retry ledgers for relay cleanup, retry requests, and delivery/read receipt jobs

Header encryption reduces message-header metadata exposure to observers that do not have session header keys. Sealed relay/control envelopes additionally move sender identity, optional sender bundle, message kind, conversation/thread data, control references, and inner encrypted-message metadata inside an envelope encrypted to the recipient. Sealed envelope keys are themselves hybrid-derived from an ephemeral X25519 DH output plus an ML-KEM-768 encapsulation to the recipient identity key, with envelope metadata bound into HKDF and AES-GCM associated data. The low-level sealed-envelope opener verifies the sealed sender credential signature and optional in-memory envelope-nonce replay cache; higher-level chat handling checks sender credentials against included sender bundles when a bundle is present, requires signed control messages to verify against an already stored contact key, and binds X3DH bootstrap keys through session establishment before trusting sender identity. `BackendBundleServer` chat sends, receives, and control messages use sealed-only routes.

## Storage Threat Model

Storage encryption is implemented in [`src/storage/local.ts`](src/storage/local.ts) and is opt-in. React Native integrations must supply a storage adapter with `setStorageInstance()` before using local chat storage.

When enabled, sensitive local records are encrypted before persistence, including:

- private identity keys
- private pre-key bundles
- session state
- public bundles
- conversations and previews
- message records and local plaintext cache records
- processed-message/retry ledgers
- relay delivery/read receipt retry ledgers
- tracked identity records

Minimal lookup fields may remain plaintext so that IndexedDB/localStorage can retrieve records efficiently. Examples include record IDs, conversation IDs, timestamps used for indexes, relay lookup keys, and trust-state indexes. Storage encryption covers sensitive fields and record payloads where the storage API supports encrypted records; it should not be read as a promise that every persisted object is serialized as one fully opaque blob.

Password-derived storage keys use versioned KDF metadata. Current storage metadata records include:

- algorithm: PBKDF2-HMAC-SHA256
- versioned metadata
- random salt
- explicit iteration count

KDF metadata is stored separately in `localStorage`, including when IndexedDB stores chat records, so it is not confidential. The current parser enforces supported storage metadata versions and rejects future versions, while retaining legacy handling for records without version metadata. This protects at-rest data against casual backup/database inspection when storage encryption is enabled. It does not protect against malware or a compromised runtime after the encryption key has been unlocked in memory.

## Bundle Metadata And Wallet Binding

Public key bundles have a primary ML-DSA signature over static identity fields and the signed pre-key. Metadata capabilities are authenticated separately with an ML-DSA `capabilitiesSignature`, so relay capability hints can be verified without changing the primary bundle signature contract.

Wallet-linked bundles include a wallet authorization payload. The wallet public key derives an EXO address with Keccak-256, and the authorization payload is signed with the wallet ML-DSA private key to bind that wallet address to the chat identity bundle. This wallet authorization signature is distinct from the bundle's primary ML-DSA signature. Wallet-linked bundle publishing and contact imports that know the expected wallet address require that authorization to match.

Bundle publication, signed-pre-key rotation, and OPK replenishment use authenticated API operations; this package exposes no direct table access. A contact bundle fetch requires an invitation capability in `GET /v1/chat/bundles/{identityId}?requestorId=...&inviteCapability=...`. Separately, `fetchDiscoverableBundle` supports opt-in wallet-address discovery through `GET /v1/chat/discovery/bundles/{walletAddress}`, and one-time contact cards use their own redemption route. The client still verifies the bundle signature and wallet authorization before use.

## Replay Persistence Semantics

Message and signed-control replay protection is persisted through processed-message records and session state.

Call replay protection is represented by serializable `CallReplayState` in [`src/types/index.ts`](src/types/index.ts) and implemented in [`src/crypto/call.ts`](src/crypto/call.ts):

- RTP replay state is tracked per SSRC with a sliding replay window.
- Call signaling tracks the last accepted inbound sequence number.
- Replay state can be serialized with the call session and restored after process restart.

The low-level call decrypt helpers use replay-aware defaults for in-memory operation. Production call session handling should persist `CallSession.replayState` along with the call/session lifecycle if calls need restart-resilient replay protection.

Sealed envelope nonce replay protection is represented by `SealedEnvelopeReplayCache`, which is in-memory in this package. Durable replay handling for delivered chat messages and accepted signed control messages relies on processed-message records and session state rather than persisted sealed-envelope nonce state.

The low-level sealed-envelope open helpers only check the envelope nonce replay cache when a caller passes a `SealedEnvelopeReplayCache`. The `QuantumChat` relay path does this; custom integrations should pass a cache and still persist higher-level processed-message or accepted-control records if restart-resilient replay protection is required.

## Integration Notes

`ConversationHandle.sendMessage` encrypts and stores a local/offline-safe message. Server relay delivery uses `ConversationHandle.sendMessageViaRelay` or an equivalent caller path that uploads a sealed relay record through the configured bundle server.

`QuantumChat` applies relay receipt updates through a monotonic local lifecycle reducer and stores delivery/read receipt retry jobs locally before attempting relay HTTP routes. After a relayed message is locally persisted and its receipt path is sent or intentionally skipped by policy, the client schedules backend relay deletion. Sender-side receipt fetches use the relay row ID plus the opaque delivery token returned at relay accept time; receipts do not store inner message IDs or identity metadata. This makes receipt propagation restart-resilient while preserving the user's receipt policy: disabled delivery or read receipts are not enqueued, and policy-disabled queued jobs are discarded.

Inbound mailbox selection for default mailbox tokens, locally stored scoped mailbox tokens, and server-registered scoped mailbox tokens is centralized in `src/client/mailboxRegistry.ts`. Backend bundle publishing registers default `smbx1` mailbox tokens for the authenticated wallet owner; generic mailbox registration is reserved for scoped `smbx2` tokens. Backend receive refreshes local scoped mailboxes and fetches pending sealed message and control rows only through authenticated owned-inbox routes. App services should use that registry instead of rebuilding token-selection logic in UI or feature modules.

Signed pre-key rotation must publish an authenticated bundle update: the new signed pre-key, bundle version, bundle timestamp, bundle signature, metadata-capability signature, and wallet authorization when present must match. `BackendBundleServer.updateSignedPreKey` accepts a full verified `PublicKeyBundle` for this reason; callers should not patch a bare signed pre-key.

Canonical JSON is used for signature payloads that need stable key ordering. Signed payload builders in this package construct explicit typed objects; custom callers should avoid adding semantically meaningful `undefined`, function, or symbol properties because JSON-compatible canonicalization omits non-JSON object values.

## Runtime And Consumption

This private package is consumed as TypeScript source through the monorepo path aliases; it is not published or built as a standalone npm artifact. Import the high-level API from the root:

```ts
import { QuantumChat, PROTOCOL_VERSIONS } from '@spectra/core-crypto'
```

The repository tooling requires Node `>=20.19.4 <21`. Runtime code targets React Native-compatible primitives; the default local storage adapter uses IndexedDB when available and can fall back to `localStorage`. React Native integrations must inject a storage adapter before use. Cryptographic JavaScript dependencies are declared at the workspace root. Native ML-KEM and ML-DSA modules are optional accelerators resolved through React Native `NativeModules`; they are absent in Node tests, which use the JavaScript oracle. This package's BLE Noise surface is adapter contracts and validation rather than a bundled Noise implementation, so external extraction requires explicit dependencies, a storage adapter, and a handshake adapter.

## Test And Audit Posture

The test suite is intended to be auditor-oriented. It includes:

- primitive tests for AES-GCM, X25519, ML-KEM, ML-DSA, and utilities
- native ML-KEM and ML-DSA module adapter tests with a JavaScript-oracle fallback path
- X3DH initiator/responder agreement and bundle verification tests
- Double Ratchet ping-pong, out-of-order, replay, tamper, header-encryption, and serialization tests
- full Alice/Bob real-primitive protocol integration tests
- storage encryption-at-rest and KDF metadata tests
- safety number and TOFU tests
- call key, SRTP-like packet, signaling, replay, and restart-persistence tests
- canonical JSON, wallet authorization, and conversation-handle tests
- sealed-envelope encryption, credential, tamper, and replay-cache tests
- BLE route capability/envelope, fragmentation, acceptance-receipt, credential, Noise-material, and replay tests
- server trust-boundary tests for bundle and relay behavior

Run:

```sh
npm exec -- vitest run packages/spectra-core-crypto/src --testTimeout 30000
```

Test counts change as focused regressions are added. Run the command above for the current package-level result, including any failing cases; do not treat the command as a claim that the suite is currently green.
