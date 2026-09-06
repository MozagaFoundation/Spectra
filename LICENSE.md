# Spectra Licensing Overview

Copyright (c) 2026 MOZAGA FOUNDATION.

Spectra is licensed by MOZAGA FOUNDATION, a private interest foundation in Panama. Contact: m.fajardo@mozaga.org. MOZAGA FOUNDATION website: https://mozaga.org. Spectra website: https://spectraprotocol.org.

## 1. Source Code License

Unless a file contains a different license notice, Spectra source code is available under:

```text
GNU Affero General Public License version 3 only
OR a separate written commercial license from MOZAGA FOUNDATION
```

Recommended SPDX identifier:

```text
SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
```

The full AGPLv3 text is included in `LICENSE-AGPL-3.0.txt`.

`LicenseRef-Spectra-Commercial` identifies the optional commercial alternative described in `LICENSE-COMMERCIAL.md`. It does not grant commercial rights on its own; those rights exist only under a separately executed written agreement with MOZAGA FOUNDATION.

## 2. Commercial Licensing

Use outside the AGPLv3, including closed-source distribution or proprietary integration, requires a separate written commercial license from MOZAGA FOUNDATION.

See:

```text
LICENSE-COMMERCIAL.md
```

## 3. Trademarks And Official Services

The source code licenses do not grant rights to Spectra names, logos, marks, official services, production endpoints, app identities, signing keys, app-store listings, service accounts, payment wallets, or operational infrastructure.

See:

```text
TRADEMARKS.md
```

## 4. Infrastructure And Secrets

Official deployment infrastructure, production configuration, credentials, signing material, provider accounts, monitoring configuration, Terraform/OpenTofu state, and runtime secrets are not part of the public source code license grant.

## 5. Third-Party Software

Third-party components remain governed by their own licenses. The vendored LibTomMath copy used by the native VDF module is documented in `native/vdf-core/NOTICE.md` and `native/vdf-core/vendor/libtommath/LICENSE`. The vendored PQClean ML-DSA-65 and ML-KEM-768 cores are documented in `native/mldsa-core/NOTICE.md`, `native/mlkem-core/NOTICE.md`, `native/pq-common/NOTICE.md`, and their respective `vendor/pqclean` LICENSE files. This licensing overview does not replace third-party license obligations.
