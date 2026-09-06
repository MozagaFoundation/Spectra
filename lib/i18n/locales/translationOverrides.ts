/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import ar from './translationOverrides.ar'
import bn from './translationOverrides.bn'
import de from './translationOverrides.de'
import es from './translationOverrides.es'
import fr from './translationOverrides.fr'
import hi from './translationOverrides.hi'
import id from './translationOverrides.id'
import it from './translationOverrides.it'
import pt from './translationOverrides.pt'
import ru from './translationOverrides.ru'
import ur from './translationOverrides.ur'
import zhHans from './translationOverrides.zhHans'
import type { LocaleTranslationOverrides } from './translationOverrideTypes'

export const translationOverrides: Record<string, LocaleTranslationOverrides> = {
  ar,
  bn,
  de,
  es,
  fr,
  hi,
  id,
  it,
  pt,
  ru,
  ur,
  'zh-Hans': zhHans,
}
