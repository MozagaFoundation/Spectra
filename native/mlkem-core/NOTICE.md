# Native ML-KEM-768 encaps and decaps

This directory vendors PQClean's portable FIPS 203 ML-KEM-768 implementation for
key generation, encapsulation, and decapsulation on a background native queue.

- Upstream: https://github.com/PQClean/PQClean
- Path: `crypto_kem/ml-kem-768/clean` plus `common/fips202` (SHAKE/Keccak is compiled once in `native/pq-common`)
- Commit: `0586a824fc0d49df0b6b6e9179d8d15d06d0974f`
- License: CC0 / public domain; see `vendor/pqclean/crypto_kem/ml-kem-768/clean/LICENSE`

TypeScript keeps encoding and key-format checks. `@noble/post-quantum` remains
the JavaScript oracle and fallback. Native keygen, encaps, and decaps copy
secret material for the call; native buffers are wiped afterward.
