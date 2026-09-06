/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { APP_VERSION } from './constants'

export {
  LEGAL_CONTACT_EMAIL,
  LEGAL_ENTITY_ADDRESS_LINES,
  LEGAL_ENTITY_NAME,
  LEGAL_ENTITY_RUC,
  LEGAL_OWNER_NAME,
  MOZAGA_WEBSITE_URL,
  PRIVACY_CONTACT_EMAIL,
  SPECTRA_COPYRIGHT_NOTICE,
  SPECTRA_WEBSITE_URL,
  SUPPORT_CONTACT_EMAIL,
} from '@spectra/public-content/metadata'

type ExpoConstantsLike = {
  expoConfig?: {
    version?: string | null
  } | null
}

function getExpoConstants(): ExpoConstantsLike | null {
  try {
    const constantsModule = require('expo-constants') as {
      default?: ExpoConstantsLike
    }
    return constantsModule.default ?? null
  } catch {
    return null
  }
}

export function getRuntimeAppVersion(): string {
  return getExpoConstants()?.expoConfig?.version ?? APP_VERSION
}
