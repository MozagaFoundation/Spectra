<!--
Copyright (c) 2026 MOZAGA FOUNDATION.
SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
See ../../LICENSE.md, ../../LICENSE-AGPL-3.0.txt, and ../../LICENSE-COMMERCIAL.md for details.
-->

# `@spectra/identity-vault`

Auditable identity, wallet derivation, signing, and encrypted vault primitives for Spectra.

## Status

This package is designed to be testable, reviewable, and conservative in its use of cryptographic primitives. It uses established primitives from `@noble/*` and `@scure/*`, keeps Spectra-specific derivation and vault composition code in one package, and includes deterministic vectors for auditors.

This is an audit-ready production candidate, not a substitute for a third-party cryptographic review. Claims stronger than that require external review of the derivation domains, vault format, migration behavior, and application-level storage assumptions.

## Security Goals

The package is intended to provide:

- BIP39 mnemonic generation and validation.
- Deterministic, domain-separated EXO identity derivation for the root account, one Spectre account, and five indexed transparent accounts.
- Post-quantum EXO signing keys using ML-DSA-65 in JavaScript. Wallet and vault Dilithium keys are not offloaded to the native chat-identity ML-DSA module.
- Deterministic EVM, Bitcoin, Solana, and Tron account derivation from the same mnemonic using chain-specific standards.
- Authenticated local vault encryption with explicit KDF and vault-format metadata.
- Compatibility paths for known legacy vault records so users can unlock and migrate.
- Strict parsing for external encodings used by keys, addresses, ciphertexts, salts, and verifiers.

Persistence, throttling, biometric unlock, duress PINs, fail-wipe behavior, and UI flows live outside this package, primarily in `store/walletStore.ts`, `app/(auth)/unlock.tsx`, and `services/security`.

## Package And Entry Points

Root export: `src/index.ts` re-exports `vaultCrypto`, `dilithium` (the ML-DSA-65 signing wrapper), `chainKeyDerivation`, `keyGeneration`, and `types`. `keyGeneration` also re-exports the mnemonic prefix-suggestion helper from `mnemonic.ts`.

Subpath exports from `package.json`:

- `@spectra/identity-vault/chainKeyDerivation`
- `@spectra/identity-vault/dilithium` (ML-DSA-65 signing wrapper)
- `@spectra/identity-vault/keyGeneration`
- `@spectra/identity-vault/types`
- `@spectra/identity-vault/vaultCrypto`

This package declares its own `@noble/*` and `@scure/*` dependencies. Native PBKDF2 acceleration is available on iOS and Android through `NativeModules.PBKDF2Module`. Mnemonic validation accepts 12- or 24-word phrases; new wallets are generated with 24-word / 256-bit entropy phrases.

## Non-Goals

The package does not claim:

- A formal symbolic or computational proof for the Spectra-specific derivation model.
- Offline brute-force resistance for 6-digit PIN vaults if all vault material is extracted.
- Protection after full device compromise while wallet keys or derived vault keys are unlocked in memory.
- Protection for data intentionally exported, displayed, logged, backed up, or shared by application code.
- Anonymity or unlinkability across accounts beyond the explicit domain separation described below.
- Standalone npm distribution readiness; the package is currently consumed as TypeScript source in the Spectra monorepo.

## Primitive Choices

- Mnemonics: BIP39, English wordlist, 256 bits entropy for newly generated 24-word phrases.
- ML-DSA-65 provides post-quantum EXO signatures in JavaScript.
- secp256k1, Ed25519, BIP32, BIP39, SLIP-0010-style hardened Ed25519 derivation, Base58Check, Bech32, and Keccak/Ripemd/SHA hashing support chain account derivation.
- PBKDF2-HMAC-SHA256 derives local vault wrapping keys from user PINs.
- AES-256-GCM authenticates and encrypts vault contents.
- `crypto.getRandomValues` provides salts, AES-GCM nonces, and generated wallet IDs.

## Mnemonic Derivation Model

The same mnemonic feeds multiple independent derivation domains:

- Primary EXO: `SHA-256(normalized mnemonic)` -> ML-DSA-65 seed.
- Spectre EXO: `SHA-256("spectre:" || normalized mnemonic)` -> ML-DSA-65 seed.
- Transparent EXO index `1..5`: `SHA-256("normal:" || index || ":" || normalized mnemonic)` -> ML-DSA-65 seed.
- EVM / Bitcoin / Solana / Tron: standard BIP39 PBKDF2 seed with chain-specific derivation paths.

The EXO derivations are intentionally not BIP32 child keys. Auditors should treat them as
Spectra-specific deterministic domains, not as portable HD wallet derivation paths.

`deriveDeterministicEXOWalletBundle` is the app-facing recovery model: one recovery phrase restores the root EXO wallet, five indexed transparent EXO wallets, and one Spectre wallet. `DETERMINISTIC_EXO_WALLET_BUNDLE_SIZE` is therefore `7`. The transparent account indexes are lifetime deterministic slots, not user-created random subaccounts.

The bundle derivation options support custom display names, synchronous `onProgress` reporting, and an awaited `yieldToEventLoop` callback after each derived wallet. The app uses these callbacks to keep import progress responsive while deriving the seven wallets sequentially. `getEnglishBip39PrefixSuggestions` provides normalized English-wordlist suggestions for mnemonic entry and is available from the package root.

## Vault Format And KDF

Current vault records use version `4` envelope encryption:

- A random 32-byte `vaultKey` generated with `crypto.getRandomValues`.
- AES-256-GCM vault-content encryption under the `vaultKey`.
- Key slots that wrap the `vaultKey` instead of encrypting wallet contents directly from a PIN.
- A `pin_device` slot using PBKDF2-HMAC-SHA256 over the PIN plus a 32-byte device secret stored in SecureStore / Keychain.
- Optional `recovery_passphrase` slots for high-entropy recovery passphrases.
- 100,000 PBKDF2 iterations per slot unless a slot records a different audited parameter.
- 16-byte random slot salts, 12-byte random AES-GCM nonces, and authenticated slot metadata.

Legacy vault records may use vault version `1` without associated-data metadata binding, vault version `2` with PBKDF2-derived content encryption and associated data over `version`, `salt`, and `kdfIterations`, or vault version `3` with unbound key-slot metadata. They are accepted only for compatibility and should be migrated to v4 after successful unlock.

The package still accepts legacy `sha256(derivedKey)` and `raw_pbkdf2` verifier material so existing vaults can unlock and migrate. New v4 records do not need a standalone PIN verifier; successful unlock is proven by unwrapping the `vaultKey` and decrypting authenticated vault data.

New recovery-passphrase slots require at least 16 normalized characters and 80 bits of estimated entropy. Existing recovery slots can still be unlocked so weak legacy choices do not permanently strand users, but callers should rotate them after unlock.

## PIN Threat Model

The current app UI uses a 6-digit numeric PIN. In current vault envelopes, the PIN is not enough to check guesses against a copied vault blob because the `pin_device` slot also requires the device secret stored through platform secure storage. This hardens vault-blob-only offline brute force, but it does not protect against full device compromise where the attacker also extracts SecureStore / Keychain material or captures unlocked memory.

Expected protections for production custody are therefore layered:

- Device SecureStore / keychain protection for device-bound slot secrets and biometric vault-key storage.
- App-level throttling and lockout on unlock attempts.
- Optional fail-wipe and duress flows in the app security layer.
- High-entropy recovery passphrases for vault recovery when device-bound credentials are unavailable.

## Versioning And Compatibility Model

- Vault v4 records encrypt wallet contents with a random `vaultKey`, wrap that key through versioned key slots, and bind the slot manifest as vault-content associated data.
- Vault v3 records use the same vault-key/key-slot model but are accepted only as a migration format.
- Vault v2 records bind `version`, `salt`, and `kdfIterations` as AES-GCM associated data.
- Vault v1 records remain readable for known persisted vault compatibility.
- Future direct-key and key-slot vault versions are rejected unless an explicit migration path is added.
- Legacy 10,000-iteration KDF metadata remains readable and should migrate after successful unlock.
- Legacy `raw_pbkdf2` verifier records remain readable and should migrate after successful unlock.
- Unsupported future vault formats should require an explicit parser/migration path rather than silent acceptance.

## Metadata And Storage Leakage Model

The encrypted vault protects wallet contents at rest, but not all metadata is hidden from the application storage layer.

Expected visible or separately stored metadata includes:

- Whether a wallet exists on the device.
- Legacy PIN verifier metadata: verifier, salt, and KDF iteration count until a v4 migration deletes it.
- Vault envelope metadata: version, IV, and key-slot metadata.
- Device-bound slot secret existence in SecureStore / Keychain.
- Lockout, duress, biometric, and fail-wipe state stored by application security services.
- Any key material intentionally exported to application memory after unlock.

Vault plaintext includes private EXO keys, chain private keys, active wallet IDs, and address-book keys. Once unlocked, these values are available to the application runtime.

## Runtime Assumptions

- `crypto.getRandomValues`, `TextEncoder`, `TextDecoder`, `btoa`, and `atob` are available in the
  React Native / Expo runtime.
- iOS and Android may provide a native PBKDF2 module through `NativeModules.PBKDF2Module`; the JS fallback is
  the source of truth and tests assert native/JS parity.
- The package is consumed as TypeScript source inside the Spectra monorepo. It is private and is not
  currently packaged as a standalone compiled npm artifact.

Import public APIs through the monorepo alias:

```ts
import {
  DETERMINISTIC_EXO_WALLET_BUNDLE_SIZE,
  deriveDeterministicEXOWalletBundle,
  getEnglishBip39PrefixSuggestions,
  validateMnemonic,
} from '@spectra/identity-vault'
```

## Test And Audit Posture

The test suite is intended to be auditor-oriented. It includes:

- vault encryption, v4 envelope/key-slot, v3 migration, tamper, wrong-key, malformed Base64, AAD, and v1 compatibility tests
- KDF sync/async and native-module parity tests
- current and legacy PIN verifier tests
- real ML-DSA-65 key generation, signing, verification, and malformed key tests
- default signing-domain ML-DSA tests
- deterministic EVM, Bitcoin, Solana, and Tron derivation vectors
- Base58, Base58Check, Bech32, and SegWit encoding tests
- real wallet integration tests without mocking package crypto modules
- wallet-store migration tests for legacy-to-v4 migration, PIN slot rotation, biometric unlock, and recovery passphrase unlock

From the Spectra repository root:

```sh
npm exec -- vitest run packages/spectra-identity-vault/src store/walletStore.test.ts
npm run test -- --run
npm run lint
npm run typecheck
```

Package-local convenience scripts delegate to the repository root:

```sh
npm --prefix packages/spectra-identity-vault run test -- --run
npm --prefix packages/spectra-identity-vault run lint
```
