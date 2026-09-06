/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

const TORRC_CONTROL_CHARACTER_REGEX = /[\u0000-\u001f\u007f]/

export function normalizeTorBridgeLine(bridge: string, index: number): string {
  const trimmed = bridge.trim()

  if (trimmed.length === 0) {
    return ''
  }

  if (TORRC_CONTROL_CHARACTER_REGEX.test(trimmed)) {
    throw new Error(`Bridge line ${index + 1} contains unsupported control characters`)
  }

  return trimmed
}

export function normalizeTorBridgeLines(bridges: string[]): string[] {
  return bridges
    .map((bridge, index) => normalizeTorBridgeLine(bridge, index))
    .filter((bridge) => bridge.length > 0)
}
