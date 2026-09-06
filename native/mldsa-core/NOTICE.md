# Native ML-DSA-65 verify and sign

This directory vendors PQClean's portable FIPS 204 ML-DSA-65 implementation for
signature verification and chat-identity signing on a background native queue.

- Upstream: https://github.com/PQClean/PQClean
- Path: `crypto_sign/ml-dsa-65/clean` plus `common/fips202` (SHAKE/Keccak is compiled once in `native/pq-common`)
- Commit: `0586a824fc0d49df0b6b6e9179d8d15d06d0974f`
- License: CC0 / public domain; see `vendor/pqclean/crypto_sign/ml-dsa-65/clean/LICENSE`

TypeScript keeps canonicalization and key-format checks. Verify receives public
key, signature, and message bytes. Sign copies the chat identity secret key for
the call; native buffers are wiped afterward. Key generation, mnemonics, vault
secrets, and wallet Dilithium keys stay in JavaScript.
