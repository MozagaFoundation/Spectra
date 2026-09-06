/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { InteractionManager } from 'react-native'

export function yieldToQuantumChatHost(
  _stage?: string,
  progress?: { priority?: 'realtime' | 'background' },
): Promise<void> {
  if (progress?.priority === 'realtime') {
    return new Promise((resolve) => setTimeout(resolve, 0))
  }
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      setTimeout(resolve, 0)
    })
  })
}
