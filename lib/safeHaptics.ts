/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as Haptics from 'expo-haptics'

function runHaptic(effect: () => Promise<void>): void {
  try {
    void effect().catch(() => {})
  } catch {}
}

export function impactAsync(style: Haptics.ImpactFeedbackStyle): void {
  runHaptic(() => Haptics.impactAsync(style))
}

export function notificationAsync(type: Haptics.NotificationFeedbackType): void {
  runHaptic(() => Haptics.notificationAsync(type))
}

export function selectionAsync(): void {
  runHaptic(() => Haptics.selectionAsync())
}

export { Haptics }
