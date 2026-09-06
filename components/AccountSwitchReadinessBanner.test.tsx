/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import type { ReactTestInstance } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react-native'

import { AccountSwitchReadinessBanner } from './AccountSwitchReadinessBanner'

const rootWallet = {
  address: 'EXO_ROOT',
  id: 'root-wallet',
  name: 'Root',
}

const targetWallet = {
  address: 'EXO_TARGET',
  id: 'target-wallet',
  name: 'Target',
}

const secondWallet = {
  address: 'EXO_SECOND',
  id: 'second-wallet',
  name: 'Second',
}

const mockState = vi.hoisted(() => ({
  accountReadiness: {
    dismiss: vi.fn(),
    rootWallet: null as { address: string; id: string; name: string } | null,
    wallet: null as { address: string; id: string; name: string } | null,
  },
  activateChatPersona: vi.fn(),
  cleanupChat: vi.fn(),
  ensureActiveChatIdentityReady: vi.fn(),
  getRootExoWallet: vi.fn(),
  identityOverride: undefined as { blockchainAddress: string; id: string } | null | undefined,
  initializeChat: vi.fn(),
  isQuantumChatInitialized: vi.fn(),
  walletStore: {
    wallets: [] as Array<{ address: string; id: string; name: string }>,
  },
}))

function currentIdentity() {
  if (typeof mockState.identityOverride !== 'undefined') {
    return mockState.identityOverride
  }

  const wallet = mockState.accountReadiness.wallet
  return wallet
    ? { blockchainAddress: wallet.address, id: `identity-${wallet.id}` }
    : null
}

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../test/mainScreenMocks')
  return {
    CheckCircle2: TestIcon,
    CircleAlert: TestIcon,
    RefreshCw: TestIcon,
    RotateCcw: TestIcon,
  }
})

vi.mock('react-native-safe-area-context', async () => {
  const { createSafeAreaMock } = await import('../test/mainScreenMocks')
  return createSafeAreaMock()
})

vi.mock('@/lib/i18n', () => ({
  translate: (key: string) => key,
}))

vi.mock('@/lib/theme', async () => {
  const { createThemeMock } = await import('../test/mainScreenMocks')
  return createThemeMock()
})

vi.mock('@/store/accountReadinessStore', () => ({
  useAccountReadinessStore: (selector: (state: typeof mockState.accountReadiness) => unknown) => (
    selector(mockState.accountReadiness)
  ),
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: (selector: (state: typeof mockState.walletStore) => unknown) => (
    selector(mockState.walletStore)
  ),
}))

vi.mock('@/services/chat', () => ({
  cleanupChat: mockState.cleanupChat,
  initializeChat: mockState.initializeChat,
}))

vi.mock('@/services/chat/personaSwitch', () => ({
  activateChatPersona: mockState.activateChatPersona,
}))

vi.mock('@/services/quantumChat', () => ({
  ensureActiveChatIdentityReady: mockState.ensureActiveChatIdentityReady,
  getIdentity: () => currentIdentity(),
  isQuantumChatInitialized: mockState.isQuantumChatInitialized,
}))

vi.mock('@/services/wallet', () => ({
  getRootExoWallet: mockState.getRootExoWallet,
}))

function textContent(node: ReactTestInstance): string {
  return node.children.map((child) => (
    typeof child === 'string' ? child : textContent(child)
  )).join('')
}

function findHost(root: ReactTestInstance, type: string): ReactTestInstance[] {
  return root.findAll((node) => node.type === type)
}

function renderedTexts(root: ReactTestInstance): string[] {
  return findHost(root, 'Text').map(textContent)
}

function findPressableByText(root: ReactTestInstance, text: string): ReactTestInstance {
  return findHost(root, 'Pressable')
    .find((node) => node.findAll((child) => textContent(child) === text).length > 0)!
}

async function flushAsync() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

function showTarget(wallet = targetWallet) {
  mockState.accountReadiness.wallet = wallet
  mockState.accountReadiness.rootWallet = rootWallet
}

describe('AccountSwitchReadinessBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.accountReadiness.wallet = null
    mockState.accountReadiness.rootWallet = null
    mockState.accountReadiness.dismiss.mockImplementation(() => {
      mockState.accountReadiness.wallet = null
      mockState.accountReadiness.rootWallet = null
    })
    mockState.walletStore.wallets = [rootWallet, targetWallet, secondWallet]
    mockState.activateChatPersona.mockResolvedValue(targetWallet)
    mockState.ensureActiveChatIdentityReady.mockResolvedValue({
      success: true,
      sessionReady: true,
      identityBound: true,
    })
    mockState.getRootExoWallet.mockReturnValue(rootWallet)
    mockState.identityOverride = undefined
    mockState.initializeChat.mockResolvedValue(undefined)
    mockState.isQuantumChatInitialized.mockReturnValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stays hidden when no account switch is pending', () => {
    const view = render(<AccountSwitchReadinessBanner />)

    expect(renderedTexts(view.root)).toHaveLength(0)
    expect(mockState.ensureActiveChatIdentityReady).not.toHaveBeenCalled()
  })

  it('verifies the switched account and auto-dismisses', async () => {
    vi.useFakeTimers()
    showTarget()
    const view = render(<AccountSwitchReadinessBanner includeTopInset={false} />)

    await flushAsync()

    expect(mockState.ensureActiveChatIdentityReady).toHaveBeenCalled()
    expect(renderedTexts(view.root)).toContain('Account ready')

    await act(async () => {
      vi.advanceTimersByTime(800)
    })

    expect(mockState.accountReadiness.dismiss).toHaveBeenCalledTimes(1)
  })

  it('shows a session failure without requiring public discovery', async () => {
    showTarget()
    mockState.ensureActiveChatIdentityReady.mockResolvedValue({
      success: false,
      sessionReady: false,
      identityBound: false,
    })
    const view = render(<AccountSwitchReadinessBanner />)

    await flushAsync()

    expect(renderedTexts(view.root)).toContain('Connection problem')
    expect(renderedTexts(view.root)).toContain('Could not verify the server session for this EXO account.')
  })

  it('rejects a chat identity that never switches to the selected wallet', async () => {
    vi.useFakeTimers()
    showTarget()
    mockState.identityOverride = {
      blockchainAddress: 'EXO_OTHER',
      id: 'identity-other',
    }
    const view = render(<AccountSwitchReadinessBanner />)

    await flushAsync()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_250)
    })
    await flushAsync()

    expect(renderedTexts(view.root)).toContain('Connection problem')
    expect(renderedTexts(view.root)).toContain('Chat identity did not finish switching. Try reconnecting.')
    expect(mockState.ensureActiveChatIdentityReady).not.toHaveBeenCalled()
  })

  it('surfaces identity binding failures after the session check passes', async () => {
    showTarget()
    mockState.ensureActiveChatIdentityReady.mockResolvedValue({
      success: false,
      sessionReady: true,
      identityBound: false,
    })
    const view = render(<AccountSwitchReadinessBanner />)

    await flushAsync()

    expect(renderedTexts(view.root)).toContain('Could not link this chat identity to the server.')
  })

  it('retries with a forced chat persona reconnect after a reachable failure', async () => {
    showTarget()
    mockState.ensureActiveChatIdentityReady
      .mockResolvedValueOnce({
        success: false,
        sessionReady: false,
        identityBound: false,
      })
      .mockResolvedValue({
        success: true,
        sessionReady: true,
        identityBound: true,
      })
    const view = render(<AccountSwitchReadinessBanner />)

    await flushAsync()
    expect(renderedTexts(view.root)).toContain('Connection problem')

    await fireEvent.press(findPressableByText(view.root, 'Retry'))
    await flushAsync()

    expect(mockState.cleanupChat).toHaveBeenCalledTimes(1)
    expect(mockState.activateChatPersona).toHaveBeenCalledWith(
      'target-wallet',
      { verifyCloudBinding: false },
    )
    expect(renderedTexts(view.root)).toContain('Account ready')
  })

  it('switches back to the root account from an error state', async () => {
    showTarget()
    mockState.ensureActiveChatIdentityReady.mockResolvedValue({
      success: false,
      sessionReady: false,
      identityBound: false,
    })
    const view = render(<AccountSwitchReadinessBanner />)

    await flushAsync()
    await fireEvent.press(findPressableByText(view.root, 'Root account'))

    expect(mockState.getRootExoWallet).toHaveBeenCalledWith([rootWallet, targetWallet, secondWallet])
    expect(mockState.cleanupChat).toHaveBeenCalledTimes(1)
    expect(mockState.activateChatPersona).toHaveBeenCalledWith('root-wallet')
    expect(mockState.accountReadiness.dismiss).toHaveBeenCalledTimes(1)
  })

  it('ignores a stale failure after a newer wallet readiness run starts', async () => {
    let releaseStaleSession!: () => void
    showTarget()
    mockState.ensureActiveChatIdentityReady
      .mockImplementationOnce(() => new Promise((resolve) => {
        releaseStaleSession = () => resolve({
          success: false,
          sessionReady: false,
          identityBound: false,
        })
      }))
      .mockResolvedValue({
        success: true,
        sessionReady: true,
        identityBound: true,
      })
    const view = render(<AccountSwitchReadinessBanner />)

    await flushAsync()
    mockState.accountReadiness.wallet = secondWallet
    view.update(<AccountSwitchReadinessBanner />)
    await flushAsync()

    expect(renderedTexts(view.root)).toContain('Account ready')

    releaseStaleSession()
    await flushAsync()

    expect(renderedTexts(view.root)).toContain('Account ready')
    expect(renderedTexts(view.root)).not.toContain('Connection problem')
  })
})
