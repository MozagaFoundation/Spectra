# Shared native PQ helpers

CSPRNG, wipe, and FIPS 202 (SHAKE/Keccak) used by SpectraMldsaCore and SpectraMlkemCore.

FIPS 202 is PQClean's `common/fips202` at commit `0586a824fc0d49df0b6b6e9179d8d15d06d0974f` (CC0 / public domain). See `native/mldsa-core/vendor/pqclean/common/LICENSE`. SHA3/SHAKE entry points are prefixed (`PQCLEAN_*`) and compiled with hidden visibility so they cannot interpose in-process Tor/OpenSSL.
