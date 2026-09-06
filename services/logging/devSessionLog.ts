/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { sanitizeMobileLogFields } from './mobileLogger'

export const DEV_SESSION_LOG_FILENAME = 'spectra-catchup.log'
const MAX_LOG_BYTES = 1_500_000

let writeQueue: Promise<void> = Promise.resolve()

function isDevSessionLogEnabled(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true
}

function safeToken(value: string): string {
  return /^[a-z0-9_.-]{1,80}$/i.test(value) ? value : 'invalid_event'
}

function encodeUtf8(value: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value)
  }
  const bytes = new Uint8Array(value.length)
  for (let i = 0; i < value.length; i += 1) {
    bytes[i] = value.charCodeAt(i) & 0xff
  }
  return bytes
}

/** DEV-only durable log. Pull from the simulator Documents directory after a run. */
export function persistDevSessionLog(
  source: string,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  if (!isDevSessionLogEnabled()) return

  const line = `${JSON.stringify({
    t: Date.now(),
    source: safeToken(source),
    event: safeToken(event),
    fields: sanitizeMobileLogFields(fields),
  })}\n`

  writeQueue = writeQueue
    .then(() => appendDevSessionLogLine(line))
    .catch(() => undefined)
}

async function appendDevSessionLogLine(line: string): Promise<void> {
  const { File, Paths } = await import('expo-file-system')
  if (!Paths.document) return

  const file = new File(Paths.document, DEV_SESSION_LOG_FILENAME)
  if (file.exists && file.size > MAX_LOG_BYTES) {
    file.delete()
  }
  if (!file.exists) {
    file.create()
  }

  const handle = file.open()
  try {
    handle.offset = handle.size ?? file.size
    handle.writeBytes(encodeUtf8(line))
  } finally {
    handle.close()
  }
}
