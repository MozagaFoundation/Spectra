/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

type MediaTrackLike = {
  enabled?: boolean
  id?: string
  kind?: string
  label?: string
  muted?: boolean
  readyState?: string
}

type MediaStreamLike = {
  getAudioTracks?: () => MediaTrackLike[]
  getVideoTracks?: () => MediaTrackLike[]
}

export function getTrackStableId(track: MediaTrackLike | null | undefined): string {
  if (track?.id) {
    return track.id
  }

  return `${track?.kind || 'unknown'}:${track?.label || 'unlabeled'}`
}

function isTrackLive(
  track: MediaTrackLike | null | undefined,
  options?: { allowMuted?: boolean },
): boolean {
  if (!track || track.readyState === 'ended' || track.enabled === false) {
    return false
  }

  if (options?.allowMuted === false && track.muted === true) {
    return false
  }

  return true
}

function hasLiveTrack(
  stream: MediaStreamLike | null | undefined,
  kind: 'audio' | 'video',
  options?: { allowMuted?: boolean },
): boolean {
  let tracks: MediaTrackLike[] | undefined
  try {
    tracks =
      kind === 'audio'
        ? stream?.getAudioTracks?.()
        : stream?.getVideoTracks?.()
  } catch {
    return false
  }

  return Boolean(tracks?.some((track) => isTrackLive(track, options)))
}

export function hasLiveAudioTrack(
  stream: MediaStreamLike | null | undefined,
  options?: { allowMuted?: boolean },
): boolean {
  return hasLiveTrack(stream, 'audio', options)
}

export function hasLiveVideoTrack(
  stream: MediaStreamLike | null | undefined,
  options?: { allowMuted?: boolean },
): boolean {
  return hasLiveTrack(stream, 'video', options)
}
