/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  alert: vi.fn(),
  fileSystem: {
    deleteAsync: vi.fn(async () => undefined),
    getInfoAsync: vi.fn(async () => ({ exists: true, size: 321 })),
  },
  haptics: {
    impactAsync: vi.fn(async () => undefined),
    ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  },
  media: {
    normalizeOutgoingMediaAttachment: vi.fn(async (attachment: unknown) => attachment),
  },
  recording: {
    getURI: vi.fn(() => 'file:///voice.m4a'),
    stopAndUnloadAsync: vi.fn(async () => ({ durationMillis: 1250, metering: -6 })),
  },
  createAsync: vi.fn(),
  progressUpdateIntervalMillis: undefined as number | undefined,
  recordingStatusUpdate: null as null | ((status: { durationMillis?: number; metering?: number }) => void),
  requestPermissionsAsync: vi.fn(),
  setAudioModeAsync: vi.fn(async () => undefined),
}))

vi.mock('react-native', async () => {
  const rn = await import('../../test/react-native')
  return {
    ...rn,
    Alert: { alert: mockState.alert },
    Animated: {
      ...rn.Animated,
      loop: () => ({ start: vi.fn(), stop: vi.fn() }),
      sequence: () => ({}),
      timing: () => ({}),
    },
  }
})

vi.mock('expo-av', () => ({
  Audio: {
    Recording: {
      createAsync: mockState.createAsync,
    },
    RecordingOptionsPresets: { HIGH_QUALITY: 'high' },
    requestPermissionsAsync: mockState.requestPermissionsAsync,
    setAudioModeAsync: mockState.setAudioModeAsync,
  },
}))

vi.mock('expo-file-system/legacy', () => mockState.fileSystem)
vi.mock('expo-haptics', () => mockState.haptics)
vi.mock('@/services/media/outgoingAttachment', () => ({
  normalizeOutgoingMediaAttachment: mockState.media.normalizeOutgoingMediaAttachment,
}))
vi.mock('lucide-react-native', async () => {
  const { TestChatIcon } = await import('../../test/chatComponentMocks')
  return { Send: TestChatIcon, Trash2: TestChatIcon }
})

vi.mock('@/lib/theme', async () => {
  const { chatTestColors } = await import('../../test/chatComponentMocks')
  return { useThemeColors: () => chatTestColors }
})

const { act, fireEvent, render } = await import('@testing-library/react-native')
const { Platform, StyleSheet } = await import('react-native')
const { VoiceRecorder } = await import('./VoiceRecorder')

async function flushEffects() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('VoiceRecorder', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    ;(Platform as { OS: string }).OS = 'ios'
    mockState.createAsync.mockImplementation(async (_options, onRecordingStatusUpdate, progressUpdateIntervalMillis) => {
      mockState.recordingStatusUpdate = onRecordingStatusUpdate
      mockState.progressUpdateIntervalMillis = progressUpdateIntervalMillis
      return { recording: mockState.recording }
    })
    mockState.progressUpdateIntervalMillis = undefined
    mockState.recordingStatusUpdate = null
    mockState.requestPermissionsAsync.mockResolvedValue({ granted: true })
    mockState.recording.getURI.mockReturnValue('file:///voice.m4a')
    mockState.recording.stopAndUnloadAsync.mockResolvedValue({ durationMillis: 1250, metering: -6 })
    mockState.media.normalizeOutgoingMediaAttachment.mockImplementation(async (attachment: unknown) => attachment)
  })

  it('cancels when microphone permission is denied', async () => {
    mockState.requestPermissionsAsync.mockResolvedValueOnce({ granted: false })
    const onCancel = vi.fn()

    render(<VoiceRecorder onSend={vi.fn()} onCancel={onCancel} />)
    await flushEffects()

    expect(onCancel).toHaveBeenCalled()
  })

  it('sends a voice-note attachment with file metadata', async () => {
    const onSend = vi.fn()
    const view = render(<VoiceRecorder onSend={onSend} onCancel={vi.fn()} />)
    await flushEffects()

    expect(mockState.createAsync).toHaveBeenCalledWith('high', expect.any(Function), 100)
    expect(mockState.progressUpdateIntervalMillis).toBe(100)

    await act(async () => {
      mockState.recordingStatusUpdate?.({ durationMillis: 400, metering: -30 })
      mockState.recordingStatusUpdate?.({ durationMillis: 800, metering: -18 })
    })
    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Send voice note' }))

    expect(mockState.fileSystem.getInfoAsync).toHaveBeenCalledWith('file:///voice.m4a')
    expect(mockState.media.normalizeOutgoingMediaAttachment).toHaveBeenCalledWith(expect.objectContaining({
      uri: 'file:///voice.m4a',
      type: 'voice_note',
    }))
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({
      type: 'voice_note',
      uri: 'file:///voice.m4a',
      fileName: expect.stringMatching(/^voice_note_.*\.m4a$/),
      mimeType: 'audio/m4a',
      fileSize: 321,
      durationMs: 1250,
      waveform: [0.5, 0.7, 0.9],
    }))
  })

  it('shows a safe retry message when Android preparation fails', async () => {
    ;(Platform as { OS: string }).OS = 'android'
    mockState.media.normalizeOutgoingMediaAttachment.mockRejectedValueOnce(new Error('invalid media'))
    const onCancel = vi.fn()
    const onSend = vi.fn()
    const view = render(<VoiceRecorder onSend={onSend} onCancel={onCancel} />)
    await flushEffects()

    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Send voice note' }))

    expect(onSend).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalled()
    expect(mockState.alert).toHaveBeenCalledWith('Unable to send', 'Please try again.')
  })

  it('advances the visible timer before the first recorder status callback', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)

    const view = render(<VoiceRecorder onSend={vi.fn()} onCancel={vi.fn()} />)
    await flushEffects()

    await act(async () => {
      vi.advanceTimersByTime(1250)
    })

    expect(view.getByText('0:01')).toBeTruthy()
  })

  it('uses compact shrinking layout on Android', async () => {
    ;(Platform as { OS: string }).OS = 'android'

    const view = render(<VoiceRecorder onSend={vi.fn()} onCancel={vi.fn()} />)
    await flushEffects()
    await act(async () => {
      mockState.recordingStatusUpdate?.({ durationMillis: 400, metering: -30 })
    })

    const container = view.root.findByProps({ className: 'flex-row items-center bg-surface rounded-2xl' })
    const waveform = view.root.findByProps({ className: 'flex-row items-center gap-0.5' })
    const timer = view.root.findByProps({ className: 'flex-row items-center' })
    const waveformBars = view.root.findAllByProps({ className: 'w-1 bg-primary rounded-full' })

    expect(StyleSheet.flatten(container.props.style).gap).toBe(8)
    expect(StyleSheet.flatten(waveform.props.style)).toMatchObject({
      flexShrink: 1,
      maxWidth: 124,
    })
    expect(StyleSheet.flatten(timer.props.style)).toMatchObject({
      flexShrink: 0,
      minWidth: 64,
    })
    expect(waveformBars).toHaveLength(1)
    expect(StyleSheet.flatten(waveformBars[0].props.style).width).toBe(3)
  })

  it('starts and sends even when haptics reject', async () => {
    mockState.haptics.impactAsync.mockRejectedValueOnce(new Error('haptics unavailable'))
    const onSend = vi.fn()
    const view = render(<VoiceRecorder onSend={onSend} onCancel={vi.fn()} />)
    await flushEffects()

    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Send voice note' }))

    expect(mockState.createAsync).toHaveBeenCalled()
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({
      type: 'voice_note',
      uri: 'file:///voice.m4a',
    }))
  })

  it('deletes a stopped recording when canceled', async () => {
    const onCancel = vi.fn()
    const view = render(<VoiceRecorder onSend={vi.fn()} onCancel={onCancel} />)
    await flushEffects()

    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Send voice note' }))
    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Cancel voice note' }))

    expect(mockState.fileSystem.deleteAsync).toHaveBeenCalledWith('file:///voice.m4a', { idempotent: true })
    expect(onCancel).toHaveBeenCalled()
  })
})
