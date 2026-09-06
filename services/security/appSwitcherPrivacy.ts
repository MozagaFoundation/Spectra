/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { VAULT_SECURITY_KEYS } from '@/lib/constants'
import { createSecureBooleanPreference } from './secureBooleanPreference'

const HIDE_CONTENT_KEY = VAULT_SECURITY_KEYS.HIDE_CONTENT
const appSwitcherPrivacyPreference = createSecureBooleanPreference(HIDE_CONTENT_KEY, true)

export async function getAppSwitcherPrivacyEnabled(): Promise<boolean> {
  return appSwitcherPrivacyPreference.getEnabled()
}

export async function setAppSwitcherPrivacyEnabled(enabled: boolean): Promise<void> {
  await appSwitcherPrivacyPreference.setEnabled(enabled)
}

export function subscribeToAppSwitcherPrivacy(listener: (enabled: boolean) => void): () => void {
  return appSwitcherPrivacyPreference.subscribe(listener)
}
