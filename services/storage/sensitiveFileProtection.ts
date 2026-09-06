/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { NativeModules, Platform } from 'react-native'

type FileProtectionModule = {
  protectPath: (path: string) => Promise<void>
}

export async function protectSensitiveFilePath(uri: string): Promise<void> {
  if (Platform.OS !== 'ios') {
    return
  }

  const module = NativeModules.AttachmentFileProtection as FileProtectionModule | undefined
  if (!module?.protectPath) {
    throw new Error('iOS file protection is unavailable')
  }

  await module.protectPath(uri)
}
