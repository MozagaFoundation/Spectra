/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import { getTrackStableId, hasLiveAudioTrack, hasLiveVideoTrack } from './callMedia'

describe('call media helpers', () => {
  it('treats live muted video tracks as renderable for RTCView mounting', () => {
    const stream = {
      getVideoTracks: () => [
        { id: 'video-1', kind: 'video', muted: true, readyState: 'live' },
      ],
    }

    expect(hasLiveVideoTrack(stream)).toBe(true)
    expect(hasLiveVideoTrack(stream, { allowMuted: false })).toBe(false)
  })

  it('rejects missing, ended, disabled, or disallowed-muted tracks', () => {
    expect(hasLiveVideoTrack(null)).toBe(false)
    expect(hasLiveVideoTrack({ getVideoTracks: () => [{ readyState: 'ended' }] })).toBe(false)
    expect(hasLiveVideoTrack({ getVideoTracks: () => [{ enabled: false, readyState: 'live' }] })).toBe(false)
    expect(hasLiveAudioTrack({ getAudioTracks: () => [{ muted: true, readyState: 'live' }] }, { allowMuted: false })).toBe(false)
  })

  it('treats disposed stream track access as not renderable', () => {
    expect(hasLiveVideoTrack({
      getVideoTracks: () => {
        throw new Error('stream disposed')
      },
    })).toBe(false)
  })

  it('detects live audio and video tracks independently', () => {
    const stream = {
      getAudioTracks: () => [{ id: 'audio-1', kind: 'audio', readyState: 'live' }],
      getVideoTracks: () => [],
    }

    expect(hasLiveAudioTrack(stream)).toBe(true)
    expect(hasLiveVideoTrack(stream)).toBe(false)
  })

  it('builds a stable fallback track id when the track has no explicit id', () => {
    expect(getTrackStableId({ id: 'explicit-track', kind: 'audio', label: 'Remote Audio' })).toBe('explicit-track')
    expect(getTrackStableId({ kind: 'audio', label: 'Remote Audio' })).toBe('audio:Remote Audio')
    expect(getTrackStableId(null)).toBe('unknown:unlabeled')
  })
})
