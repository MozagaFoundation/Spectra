/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  appState: 'background',
  backgroundFetch: {
    getStatusAsync: vi.fn(async () => 1),
    registerTaskAsync: vi.fn(async () => {}),
    unregisterTaskAsync: vi.fn(async () => {}),
  },
  taskManager: {
    defineTask: vi.fn(),
    isTaskRegisteredAsync: vi.fn(async () => false),
    task: null as null | (() => Promise<unknown>),
  },
  pollForNewMessages: vi.fn(async () => {}),
  startTor: vi.fn(async () => true),
  stopTor: vi.fn(async () => {}),
  recordTorDiagnostic: vi.fn(),
  torState: {
    enabled: false,
    status: 'disconnected',
    errorMessage: null as string | null,
  },
}))

async function loadBackgroundFetchModule() {
  vi.resetModules()
  mockState.taskManager.defineTask.mockImplementation((_name: string, task: () => Promise<unknown>) => {
    mockState.taskManager.task = task
  })
  vi.doMock('expo-background-fetch', () => ({
    BackgroundFetchResult: {
      NoData: 'NoData',
      NewData: 'NewData',
      Failed: 'Failed',
    },
    BackgroundFetchStatus: {
      Available: 1,
      Restricted: 2,
      Denied: 3,
    },
    getStatusAsync: mockState.backgroundFetch.getStatusAsync,
    registerTaskAsync: mockState.backgroundFetch.registerTaskAsync,
    unregisterTaskAsync: mockState.backgroundFetch.unregisterTaskAsync,
  }))
  vi.doMock('expo-task-manager', () => ({
    defineTask: mockState.taskManager.defineTask,
    isTaskRegisteredAsync: mockState.taskManager.isTaskRegisteredAsync,
  }))
  vi.doMock('react-native', () => ({
    AppState: {
      get currentState() {
        return mockState.appState
      },
    },
  }))
  vi.doMock('./torStore', () => ({
    useTorStore: {
      getState: () => mockState.torState,
    },
  }))
  vi.doMock('./torService', () => ({
    startTor: mockState.startTor,
    stopTor: mockState.stopTor,
  }))
  vi.doMock('@/services/quantumChat', () => ({
    pollForNewMessages: mockState.pollForNewMessages,
  }))
  vi.doMock('./torDiagnostics', () => ({
    recordTorDiagnostic: mockState.recordTorDiagnostic,
  }))

  const module = await import('./torBackgroundFetch')
  return {
    ...module,
    task: mockState.taskManager.task as () => Promise<unknown>,
  }
}

beforeEach(() => {
  mockState.appState = 'background'
  mockState.torState = {
    enabled: false,
    status: 'disconnected',
    errorMessage: null,
  }
  mockState.backgroundFetch.getStatusAsync.mockClear()
  mockState.backgroundFetch.registerTaskAsync.mockClear()
  mockState.backgroundFetch.unregisterTaskAsync.mockClear()
  mockState.taskManager.defineTask.mockClear()
  mockState.taskManager.task = null
  mockState.taskManager.isTaskRegisteredAsync.mockReset()
  mockState.taskManager.isTaskRegisteredAsync.mockResolvedValue(false)
  mockState.pollForNewMessages.mockClear()
  mockState.startTor.mockReset()
  mockState.startTor.mockResolvedValue(true)
  mockState.stopTor.mockClear()
  mockState.recordTorDiagnostic.mockClear()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.doUnmock('expo-background-fetch')
  vi.doUnmock('expo-task-manager')
  vi.doUnmock('react-native')
  vi.doUnmock('./torStore')
  vi.doUnmock('./torService')
  vi.doUnmock('@/services/quantumChat')
  vi.doUnmock('./torDiagnostics')
})

describe('torBackgroundFetch task', () => {
  it('returns NoData without polling when Tor is disabled', async () => {
    const { task } = await loadBackgroundFetchModule()

    await expect(task()).resolves.toBe('NoData')

    expect(mockState.startTor).not.toHaveBeenCalled()
    expect(mockState.pollForNewMessages).not.toHaveBeenCalled()
  })

  it('maps cooldown or expired start failures to NoData', async () => {
    mockState.torState.enabled = true
    mockState.torState.status = 'disconnected'
    mockState.torState.errorMessage = 'Tor cooldown active'
    mockState.startTor.mockResolvedValue(false)
    const { task } = await loadBackgroundFetchModule()

    await expect(task()).resolves.toBe('NoData')

    expect(mockState.pollForNewMessages).not.toHaveBeenCalled()
    expect(mockState.stopTor).not.toHaveBeenCalled()
  })

  it('polls messages and stops Tor only when the task started it in the background', async () => {
    mockState.torState.enabled = true
    mockState.torState.status = 'disconnected'
    const { task } = await loadBackgroundFetchModule()

    await expect(task()).resolves.toBe('NewData')

    expect(mockState.startTor).toHaveBeenCalledTimes(1)
    expect(mockState.pollForNewMessages).toHaveBeenCalledTimes(1)
    expect(mockState.stopTor).toHaveBeenCalledTimes(1)
  })

  it('skips polling when the app is already active', async () => {
    mockState.torState.enabled = true
    mockState.torState.status = 'disconnected'
    mockState.appState = 'active'
    const { task } = await loadBackgroundFetchModule()

    await expect(task()).resolves.toBe('NoData')

    expect(mockState.startTor).not.toHaveBeenCalled()
    expect(mockState.pollForNewMessages).not.toHaveBeenCalled()
    expect(mockState.stopTor).not.toHaveBeenCalled()
    expect(mockState.recordTorDiagnostic).toHaveBeenCalledWith(
      'background_fetch',
      'poll_skipped',
      expect.objectContaining({ reason: 'app_active' }),
    )
  })
})

describe('torBackgroundFetch registration', () => {
  it('skips registration when Tor is disabled', async () => {
    const { registerBackgroundFetch } = await loadBackgroundFetchModule()

    await registerBackgroundFetch()

    expect(mockState.backgroundFetch.registerTaskAsync).not.toHaveBeenCalled()
  })

  it('registers and unregisters the task when enabled', async () => {
    mockState.torState.enabled = true
    const { registerBackgroundFetch, unregisterBackgroundFetch } = await loadBackgroundFetchModule()

    await registerBackgroundFetch()
    expect(mockState.backgroundFetch.registerTaskAsync).toHaveBeenCalledWith('TOR_MESSAGE_POLL', {
      minimumInterval: 15 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    })

    mockState.taskManager.isTaskRegisteredAsync.mockResolvedValueOnce(true)
    await unregisterBackgroundFetch()
    expect(mockState.backgroundFetch.unregisterTaskAsync).toHaveBeenCalledWith('TOR_MESSAGE_POLL')
  })
})
