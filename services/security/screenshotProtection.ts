/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { SCREENSHOT_PROTECTION_KEY } from '@/lib/constants'
import { createSecureBooleanPreference } from './secureBooleanPreference'

const screenshotProtectionPreference = createSecureBooleanPreference(SCREENSHOT_PROTECTION_KEY, true)

export async function getScreenshotProtectionEnabled(): Promise<boolean> {
  return screenshotProtectionPreference.getEnabled()
}

export async function setScreenshotProtectionEnabled(enabled: boolean): Promise<void> {
  await screenshotProtectionPreference.setEnabled(enabled)
}

export function subscribeToScreenshotProtection(listener: (enabled: boolean) => void): () => void {
  return screenshotProtectionPreference.subscribe(listener)
}
