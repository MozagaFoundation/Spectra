# Supabase contract tests

This suite is a clean-room contract boundary for the Supabase implementation of
the Spectra API. It does not import Edge Function implementation or mobile code.
Protocol constants are copied only where interoperability requires a stable
fixture.

## What runs without a server

`deno task test` covers:

- ML-DSA-65 key generation, domain-separated signing, tamper rejection, and
  Edge/mobile fixture hashes
- canonical wallet challenges and strict JSON decoding
- EdDSA JWT claims, expiry, tamper rejection, and refresh-token replay
- sealed relay idempotency, TTL, receipts, monotonic status, and owner-only
  deletion
- appdata allowlists, signed object capabilities, account deletion, admin roles,
  and rate limits
- custom WebSocket subscribe/ack/event and bounded reconnect behavior
- route inventory plus migration and Edge Function security guards

## Local integration

Integration tests are opt-in so the offline suite remains deterministic:

```sh
SUPABASE_CONTRACT_BASE_URL=http://127.0.0.1:54321/functions/v1/spectra-api \
SUPABASE_PUBLISHABLE_KEY='<local publishable key>' \
deno task test:integration
```

The base URL must expose the versioned Spectra routes. Keep keys in the process
environment or an ignored local shell file; scripts never read or print
repository `.env` files. `SUPABASE_CONTRACT_RATE_LIMIT_PROBE_COUNT` enables the
destructive local-only burst probe.

Use `bash ../scripts/start.sh`, `bash ../scripts/reset.sh`, and
`bash ../scripts/test.sh` from any directory. Start/reset require an existing
local `supabase/config.toml`; this foundation does not create project
configuration or deploy anything.

## Guard expectations

When migrations or functions are added, guards fail on:

- public tables without RLS or policies equivalent to `USING (true)`
- broad grants to `anon` or `authenticated`
- hard-coded JWTs, service-role values returned/logged, or sensitive log fields
- direct unbounded `request.json()` parsing
- TODO/501/placeholder handlers
- API routes without an inventory contract
