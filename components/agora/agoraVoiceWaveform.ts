/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export const AGORA_MAX_WAVEFORM_SAMPLES = 50
export const AGORA_PLAYBACK_WAVEFORM_BARS = 30
const SILENCE_METERING_DB = -60
const PEAK_METERING_DB = 0

export const AGORA_FALLBACK_WAVEFORM = Array.from(
  { length: AGORA_PLAYBACK_WAVEFORM_BARS },
  (_, index) => (index % 2 === 0 ? 0.28 : 0.16),
)

export function normalizeAgoraMetering(metering?: number): number {
  if (typeof metering !== 'number' || !Number.isFinite(metering)) {
    return 0.08
  }
  const normalized = (metering - SILENCE_METERING_DB) / (PEAK_METERING_DB - SILENCE_METERING_DB)
  return Math.min(1, Math.max(0.05, normalized))
}

export function normalizeAgoraWaveformValue(value: number): number {
  if (!Number.isFinite(value)) return 0.16
  return Math.min(1, Math.max(0.05, value))
}

export function downsampleAgoraWaveform(values: number[], maxCount: number): number[] {
  if (values.length <= maxCount) return values.map(normalizeAgoraWaveformValue)
  return Array.from({ length: maxCount }, (_, index) => {
    const start = Math.floor((index * values.length) / maxCount)
    const end = Math.max(start + 1, Math.floor(((index + 1) * values.length) / maxCount))
    const chunk = values.slice(start, end)
    return normalizeAgoraWaveformValue(chunk.reduce((sum, value) => sum + value, 0) / chunk.length)
  })
}

export function clipAgoraWaveform(values: number[]): number[] {
  return values.slice(-AGORA_MAX_WAVEFORM_SAMPLES).map(normalizeAgoraWaveformValue)
}
