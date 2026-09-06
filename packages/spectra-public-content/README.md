<!--
Copyright (c) 2026 MOZAGA FOUNDATION.
SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
See ../../LICENSE.md, ../../LICENSE-AGPL-3.0.txt, and ../../LICENSE-COMMERCIAL.md for details.
-->

# `@spectra/public-content`

Framework-neutral static help, legal, contact, and translation content shared by the Spectra app and public-facing consumers.

## Status

This private package is consumed as TypeScript source inside the Spectra monorepo (`"private": true`, version `0.1.0`). It is not published as a standalone npm artifact. Copy here is the source of truth for in-app help and legal documents; translations for selected languages are maintained alongside the English source.

## Package And Entry Points

Root export: `src/index.ts` re-exports help data, legal documents, public metadata, and content translations.

Subpath exports from `package.json`:

- `@spectra/public-content`
- `@spectra/public-content/contentTranslations`
- `@spectra/public-content/helpData`
- `@spectra/public-content/legalDocs`
- `@spectra/public-content/metadata`

## Contents

- Help and FAQ structure in `helpData.ts`, including account, security, messaging, calls, contacts, crypto, Tor, Spectre, payments, Bluetooth, Agora, and appearance sections.
- Terms, privacy, payment-disclaimer, and Agora terms source text in `legalDocs.ts`.
- Public contact metadata in `metadata.ts`: website URLs, legal/privacy contact emails, and MOZAGA FOUNDATION identity details.
- English content strings in `contentTranslations.ts`, with additional language files under `manualHelpTranslations.*.ts`.
- App translation namespace list in `schema.ts`.

`UNAVAILABLE_PUBLIC_FEATURE_IDS` currently hides `kara`, `broadcast`, and `markets` from public FAQ surfaces. Those IDs do not mean the mobile app lacks the corresponding screens; they only control which help topics are published in this static content set.

## Non-Goals

The package does not claim:

- Runtime localization of the full in-app UI. App chrome translations live under `lib/i18n/` and `locales/`.
- Protocol, cryptographic, or backend documentation. See the other `@spectra/*` package READMEs and `supabase/`.
- Standalone npm distribution readiness.

## Runtime And Consumption

Import public APIs through the monorepo alias:

```ts
import {
  FAQ_DATA,
  LEGAL_DOCS,
  SPECTRA_WEBSITE_URL,
  LEGAL_CONTACT_EMAIL,
} from '@spectra/public-content'
```
