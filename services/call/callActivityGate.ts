/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

let active = false

export function setCallActivity(activeCall: boolean): void {
  active = activeCall
}

export function hasActiveCallActivity(): boolean {
  return active
}
