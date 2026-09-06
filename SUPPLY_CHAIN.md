# Supply-chain and reproducibility policy

Production readiness fails closed when dependency provenance, migration replay,
Edge checks, protocol contracts, vulnerability, license, SBOM, or mobile
reproducibility checks fail. These controls do not change mobile protocol
boundaries or V1.0.0 wire formats.

## Immutable inputs

- GitHub Actions use full 40-character commit SHAs.
- Node, Deno, EAS CLI, and the Supabase CLI are explicit. The Supabase CLI is
  an exact root dev dependency and is invoked through npm scripts.
- JavaScript installs use `npm ci` and the tracked v3 `package-lock.json`.
  Edge npm imports use exact versions and the integrity-pinned
  `supabase/functions/deno.lock`.
- `scripts/verify-supply-chain.py` rejects mutable actions and runners,
  unapproved package sources, unlocked Deno imports, remote Supabase mutations,
  and unsafe production EAS configuration.
- Supabase and Deno tooling are excluded from the EAS archive and mobile
  TypeScript project. The CLI remains build tooling, not a mobile dependency.
- Dockerfiles and container images are not supply-chain policy inputs. CI does
  not call Docker directly; the pinned Supabase CLI owns its local test runtime.

## Database and Edge evidence

- CI starts the local Supabase stack through the pinned CLI, replays all tracked
  migrations twice with `supabase db reset --local`, and runs
  `supabase db lint --local`.
- Deno formatting, lint, type checks, shared-module tests, and offline protocol
  contracts validate domain-isolated Edge modules without project credentials.
- Deploy validation is read-only and local. Pull requests never run
  `supabase link`, `supabase db push`, `supabase functions deploy`, or secret
  mutation commands.

## Mobile reproducibility evidence

- The minified pre-Hermes production Android JavaScript export is built twice
  offline from the installed lockfile and compared by path and SHA-256.

Signed App Store and Play Store packages include signing and remote version
authority, so they are not expected to be byte-identical. CI instead proves
the unsigned pre-Hermes mobile export is deterministic and validates the
tracked native release configuration on a pinned macOS runner. Hermes
bytecode and signed-artifact inspection remain release gates because current
Hermes bytecode embeds nondeterministic data.

## Vulnerability, license, and SBOM gates

- npm and Deno dependency audits reject high and critical advisories. CodeQL
  analyzes JavaScript and TypeScript sources, including Edge modules.
- npm emits the CycloneDX SBOM. Its structure and declared licenses are
  validated before upload.
- npm lockfile licenses and the exact npm graph in the Deno lock must be
  approved by `scripts/verify-dependency-licenses.py`. Reviewed Deno package
  licenses are version-bound in that validator. Legacy npm packages whose lock
  metadata omits or uses a non-SPDX license are reviewed in
  `scripts/npm-license-overrides.json`; stale entries fail closed. Dependency
  drift without matching policy metadata fails closed.

## Exceptions and safe output

The default is no exceptions. A temporary exception must be narrowly scoped
in `scripts/supply-chain-exceptions.txt`, expire within 90 days, name an owner,
reference an approved `SEC-` or `RISK-` ticket, and include a rationale.
Vulnerability exceptions must also exist in the scanner-native ignore file;
the registry alone never suppresses a finding.

CI must not print environments, shell traces, secret contexts, project
credentials, or failed service logs. Local Supabase startup output is
suppressed because it contains disposable local keys.

Run the focused local checks with:

```sh
python3 scripts/verify-supply-chain.py
python3 scripts/verify-dependency-licenses.py
python3 -m unittest discover -s scripts -p 'test_*.py'
# After npm ci:
npm run supabase:deploy:validate
npm run supabase:start
npm run supabase:db:replay
npm run supabase:db:lint
npm run supabase:stop
bash scripts/verify-reproducible-mobile-export.sh
```
