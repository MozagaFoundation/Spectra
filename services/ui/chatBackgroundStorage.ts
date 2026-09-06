/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as FileSystem from 'expo-file-system'

export const CHAT_BACKGROUND_DIRECTORY = `${FileSystem.Paths.document.uri}chat-backgrounds/`

export async function ensureChatBackgroundDirectory(): Promise<void> {
  const info = await FileSystem.getInfoAsync(CHAT_BACKGROUND_DIRECTORY)
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CHAT_BACKGROUND_DIRECTORY, { intermediates: true })
  }
}

export async function clearCustomChatBackgrounds(): Promise<void> {
  await FileSystem.deleteAsync(CHAT_BACKGROUND_DIRECTORY, { idempotent: true })
}
