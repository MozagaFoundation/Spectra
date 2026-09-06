/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { AppNamespace } from '../schema'

/**
 * Explicit translations for catalog entries introduced after the base locale
 * files. Keeping these deltas separate makes English fallback usage auditable.
 */
export type LocaleTranslationOverrides = Partial<
  Record<AppNamespace, Record<string, string>>
>
