# Security Policy

Copyright (c) 2026 MOZAGA FOUNDATION.

Spectra is security-sensitive software. Please do not publicly disclose suspected vulnerabilities until MOZAGA FOUNDATION has had a reasonable opportunity to investigate and remediate them.

## Reporting A Vulnerability

Report security issues privately by email:

```text
m.fajardo@mozaga.org
```

Include as much detail as you can safely share:

- Affected component, branch, commit, or release.
- Impact and attack scenario.
- Reproduction steps, proof of concept, logs, or screenshots.
- Whether any private keys, credentials, user data, or production systems may be affected.

If the repository has GitHub Security Advisories enabled, you may also use GitHub's private vulnerability reporting flow.

## Secrets

Never submit private keys, seed phrases, service-role keys, `.env` files, production credentials, signing certificates, app-store credentials, API tokens, database dumps, or confidential third-party materials.

If a secret is accidentally exposed, revoke and rotate it immediately. If it reached a public fork, package registry, app artifact, build log, or release archive, assume it is compromised.

## Scope

The public source is provided for review and testing. Production infrastructure, live deployment configuration, credentials, and private operational state are out of scope for public issue reports unless MOZAGA FOUNDATION explicitly requests otherwise.
