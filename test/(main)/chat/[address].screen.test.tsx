/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  alerts: [] as Array<{ message?: string; title: string }>,
  chat: { mutedConversationIds: [] as string[], toggleMuteConversation: vi.fn() },
  keyboardListeners: new Map<string, (event?: { duration?: number }) => void>(),
  appStateListeners: [] as Array<(state: string) => void>,
  messageListProps: null as Record<string, any> | null,
  messageListRef: { current: { scrollToEnd: vi.fn() } },
  params: { address: 'identity-direct', local: undefined as string | undefined },
  router: { back: vi.fn(), dismissTo: vi.fn(), navigate: vi.fn(), push: vi.fn(), replace: vi.fn() },
  spectre: { enabled: false },
  wallet: { wallet: { address: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } },
  messages: {
    directChatBootstrap: { error: null, stage: 'ready' } as {
      error: Error | null
      stage: 'idle' | 'opening' | 'ready' | 'failed'
      identityReplacement?: {
        reason: 'identity_replacement_required'
        oldIdentityId: string
        newIdentityId: string
        walletAddress: string
        safetyNumber: {
          numeric: string
          qrData: string
          fingerprint: string
          fullHash: string
        }
        walletAuthorized: boolean
      }
    },
    handleAcceptDirectIdentityReplacement: vi.fn(),
    handleRetryDirectChat: vi.fn(),
  },
  services: {
    activateChatPersonaByAddress: vi.fn(async () => {}),
  },
  topChromeHeight: 0,
}))

const safetyNumber = {
  numeric: '123451234512345123451234512345123451234512345123451234512345',
  qrData: 'spectra:safety:v1:test',
  fingerprint: '1234 5678',
  fullHash: 'a'.repeat(64),
}

vi.mock('react-native', async () => {
  const rn = await import('../../../test/react-native')
  return {
    ...rn,
    Alert: {
      alert: (title: string, message?: string) => mockState.alerts.push({ message, title }),
    },
    Keyboard: {
      dismiss: vi.fn(),
      addListener: (eventName: string, listener: (event?: { duration?: number }) => void) => {
        mockState.keyboardListeners.set(eventName, listener)
        return {
          remove: () => {
            mockState.keyboardListeners.delete(eventName)
          },
        }
      },
    },
    AppState: {
      currentState: 'active',
      addEventListener: (_event: string, listener: (state: string) => void) => {
        mockState.appStateListeners.push(listener)
        return {
          remove: () => {
            mockState.appStateListeners = mockState.appStateListeners.filter(
              (entry) => entry !== listener,
            )
          },
        }
      },
    },
  }
})
vi.mock('react-native-keyboard-controller', async () => {
  const { View } = await import('../../../test/react-native')
  return { KeyboardAvoidingView: View }
})
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => mockState.params,
  useRouter: () => mockState.router,
}))
vi.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({}) }))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}))
vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../test/mainAppMocks')
  return { AlertCircle: TestIcon, CheckCircle: TestIcon }
})
vi.mock('@/components/common/IdentityReplacementVerification', async () => {
  const ReactActual = await import('react')
  const { Pressable, Text, View } = await import('../../../test/react-native')
  return {
    IdentityReplacementVerification: ({
      onAccept,
      replacement,
    }: {
      onAccept: () => void
      replacement: { safetyNumber: { numeric: string } }
    }) => ReactActual.createElement(
      View,
      null,
      ReactActual.createElement(
        Text,
        null,
        'This wallet is valid, but it now advertises a new chat identity. This can happen after account import or recovery.',
      ),
      ReactActual.createElement(Text, null, replacement.safetyNumber.numeric),
      ReactActual.createElement(Pressable, { onPress: onAccept }),
    ),
  }
})
vi.mock('@/contexts/TopChromeContext', () => ({ useTopChromeHeight: () => mockState.topChromeHeight }))
vi.mock('@/hooks/useScreenshotProtection', () => ({ useScreenshotProtection: vi.fn() }))
vi.mock('@/lib/theme', async () => {
  const { testColors } = await import('../../../test/mainAppMocks')
  return {
    useIsSpectreThemeActive: () => false,
    useThemeColors: () => testColors,
  }
})
vi.mock('@/lib/i18n', () => ({ translate: (key: string) => key }))
vi.mock('@/lib/accountScope', () => ({
  isSameAccountStorageScope: (a?: string, b?: string) => a?.toLowerCase() === b?.toLowerCase(),
}))
vi.mock('@/lib/disappearingMessages', () => ({
  DIRECT_DISAPPEARING_TIMER_PRESETS_MS: [null, 60_000],
  getDisappearingTimerDescription: () => '1 minute',
  isDisappearingTimerEnabled: () => false,
}))
vi.mock('@/services/chat/chatService', () => ({
  blockContact: vi.fn(async () => ({ error: null })),
  clearConversationChat: vi.fn(async () => ({ error: null })),
  deleteConversation: vi.fn(async () => ({ error: null })),
  deleteConversationForBoth: vi.fn(async () => ({ error: null })),
  isContactBlocked: vi.fn(() => false),
  resolveIdentityId: (value: string) => value,
  sendMessage: vi.fn(async () => ({ error: null })),
  setConversationDisappearingTimer: vi.fn(async () => ({ error: null })),
  unblockContact: vi.fn(async () => ({ error: null })),
}))
vi.mock('@/services/chat/personaSwitch', () => ({
  activateChatPersonaByAddress: mockState.services.activateChatPersonaByAddress,
}))
vi.mock('@/services/groupChat', () => ({
  getGroupIdFromRouteParam: (value?: string) => value?.startsWith('group:') ? value.slice(6) : null,
  isGroupRouteParam: (value?: string) => Boolean(value?.startsWith('group:')),
  sendGroupCryptoPaymentRequestUpdate: vi.fn(async () => ({ error: null })),
  sendGroupMessage: vi.fn(async () => ({ error: null })),
}))
vi.mock('@/services/quantumChat', () => ({
  applyCryptoPaymentRequestUpdate: vi.fn(async () => ({ error: null })),
  getIdentity: vi.fn(() => ({ id: 'identity-me' })),
}))
vi.mock('@/services/crypto', () => ({ createChainCryptoReceiptMessage: () => 'receipt' }))
vi.mock('@/components/media/ImageEditorModal', () => ({ ImageEditorModal: () => null }))
vi.mock('@/store/chatStore', () => {
  const useChatStore = (selector: (state: typeof mockState.chat) => unknown) => selector(mockState.chat)
  useChatStore.getState = () => mockState.chat
  return { useChatStore }
})
vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: (selector: (state: typeof mockState.spectre) => unknown) => selector(mockState.spectre),
}))
vi.mock('@/store/walletStore', () => ({
  useWalletStore: (selector: (state: typeof mockState.wallet) => unknown) => selector(mockState.wallet),
}))
vi.mock('@/hooks/chatScreen/useChatHeader', () => ({
  useChatHeader: () => ({
    bleRoute: 'internet',
    contact: { identityId: 'identity-direct', walletAddress: 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
    contactAvatarUrl: null,
    contactName: 'Alice',
    contacts: [],
    conversation: { id: 'conversation-1', remoteIdentityId: 'identity-direct' },
    exoAddress: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    groupConversation: null,
    groupMembers: [],
    groupTransferRecipients: [],
    handleStartCall: vi.fn(),
    handleUnblock: vi.fn(),
    internetAvailable: true,
    isBlocked: false,
    isBluetoothMeshMode: false,
    peerTorCallAlert: null,
    torEnabled: false,
  }),
}))
vi.mock('@/hooks/chatScreen/useChatMessages', () => ({
  useChatMessages: () => ({
    actionMenuIsOwn: false,
    actionMenuMessage: null,
    actionMenuVisible: false,
    allMessages: [],
    directChatBootstrap: mockState.messages.directChatBootstrap,
    flatListData: [],
    forwardTargets: [],
    handleCancelReply: vi.fn(),
    handleCloseActionMenu: vi.fn(),
    handleConsumeViewOnce: vi.fn(),
    handleDelete: vi.fn(),
    handleLoadOlder: vi.fn(),
    handleMessageLongPress: vi.fn(),
    handleReaction: vi.fn(),
    handleReply: vi.fn(),
    handleReplyPreviewPress: vi.fn(),
    handleRetryDirectChat: mockState.messages.handleRetryDirectChat,
    handleAcceptDirectIdentityReplacement: mockState.messages.handleAcceptDirectIdentityReplacement,
    handleRevealViewOnce: vi.fn(),
    handleSend: vi.fn(),
    hasOlderMessages: false,
    isLoadingOlder: false,
    isLoading: false,
    isSyncing: false,
    listRef: mockState.messageListRef,
    replyTo: null,
    uploadProgress: null,
  }),
}))
vi.mock('@/components/chatScreen/ChatHeader', async () => {
  const ReactActual = await import('react')
  const { Pressable, Text, View } = await import('../../../test/react-native')
  return {
    ChatHeader: ({
      contactName,
      onOpenCallOptions,
    }: {
      contactName: string
      onOpenCallOptions?: () => void
    }) => ReactActual.createElement(
      View,
      null,
      ReactActual.createElement(Text, null, contactName),
      onOpenCallOptions
        ? ReactActual.createElement(Pressable, { onPress: onOpenCallOptions, testID: 'open-call-options' }, ReactActual.createElement(Text, null, 'Open calls'))
        : null,
    ),
  }
})
vi.mock('@/components/chatScreen/ChatMessageList', async () => {
  const ReactActual = await import('react')
  const { Pressable, Text, View } = await import('../../../test/react-native')
  return {
    ChatMessageList: (props: {
      onCryptoPaymentRequestPress?: (message: any, request: any) => void
      [key: string]: any
    }) => {
      mockState.messageListProps = props
      return ReactActual.createElement(
        View,
        null,
        ReactActual.createElement(Text, null, 'MessageList'),
        ReactActual.createElement(
          Pressable,
          {
            onPress: () => props.onCryptoPaymentRequestPress?.(
              { conversationId: 'conversation-1', id: 'request-message-1' },
              {
                v: 2,
                type: 'crypto_payment_request',
                requestId: 'request-1',
                network: 'tron',
                symbol: 'TRX',
                amount: '10',
                decimals: 6,
                recipientAddress: '0xreceiver',
                assetType: 'native',
                createdAt: 1_700_000_000_000,
                state: 'paid',
                settlement: {
                  txHash: '0xabc123',
                  status: 'confirmed',
                  paidAt: 1_700_000_001_000,
                },
              },
            ),
            testID: 'paid-payment-request',
          },
          ReactActual.createElement(Text, null, 'Paid payment request'),
        ),
      )
    },
  }
})
vi.mock('@/components/chat/CallOptionsMenu', async () => {
  const ReactActual = await import('react')
  const { Text, View } = await import('../../../test/react-native')
  const CallOptionsMenu = ({ visible }: { visible: boolean }) => (
    visible ? ReactActual.createElement(View, { testID: 'call-options-menu' }, ReactActual.createElement(Text, null, 'CallOptionsMenu')) : null
  )
  return { CallOptionsMenu }
})
vi.mock('@/components/chat/MessageInput', async () => {
  const ReactActual = await import('react')
  const { Text, View } = await import('../../../test/react-native')
  return {
    MessageInput: ({ disabled, placeholder }: { disabled?: boolean; placeholder?: string }) => (
      ReactActual.createElement(View, { testID: 'message-input', disabled }, ReactActual.createElement(Text, null, placeholder || 'MessageInput'))
    ),
  }
})
vi.mock('@/components/chat/BluetoothMessageDiagnostics', () => ({
  BluetoothMessageDiagnostics: () => null,
}))
vi.mock('@/components/chat/GroupTransferRecipientModal', () => ({ GroupTransferRecipientModal: () => null }))
vi.mock('@/components/chat/HashtagModal', () => ({ HashtagModal: () => null }))
vi.mock('@/components/chat/MessageActionMenu', () => ({ MessageActionMenu: () => null }))
vi.mock('@/components/chat/ReceiveCryptoModal', () => ({ ReceiveCryptoModal: () => null }))
vi.mock('@/components/chat/SendCryptoModal', () => ({ SendCryptoModal: () => null }))
vi.mock('@/components/chat/TorDeliveryIndicator', () => ({ TorDeliveryIndicator: () => null }))
vi.mock('@/components/chat/ChatOptionsModal', () => ({ ChatOptionsModal: () => null }))

const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { Platform, Keyboard } = await import('react-native')
const { default: ChatScreen } = await import('../../../app/(main)/chat/[address]')

vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
  callback(0)
  return 0
})
vi.stubGlobal('cancelAnimationFrame', () => {})

describe('ChatScreen route guards', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockState.params = { address: 'identity-direct', local: undefined }
    mockState.spectre.enabled = false
    mockState.wallet.wallet = { address: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
    mockState.messages.directChatBootstrap = { error: null, stage: 'ready' }
    mockState.alerts = []
    mockState.messages.handleAcceptDirectIdentityReplacement.mockClear()
    mockState.messages.handleRetryDirectChat.mockClear()
    mockState.keyboardListeners.clear()
    mockState.appStateListeners = []
    mockState.messageListProps = null
    mockState.topChromeHeight = 0
    ;(Platform as { OS: string }).OS = 'ios'
  })

  it('switches to the local wallet route scope before enabling the composer', async () => {
    mockState.params = { address: 'identity-direct', local: 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }

    render(<ChatScreen />)
    await act(async () => {})

    expect(mockState.services.activateChatPersonaByAddress).toHaveBeenCalledWith(
      'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    )
    expect(screen.getAllByText('Switching EXO account...').length).toBeGreaterThan(0)
  })

  it('does not process a local-persona route while Spectre is active', async () => {
    mockState.params = { address: 'identity-direct', local: 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }
    mockState.spectre.enabled = true

    render(<ChatScreen />)
    await act(async () => {})

    expect(mockState.services.activateChatPersonaByAddress).not.toHaveBeenCalled()
  })

  it('keeps cached chat visible while secure activation gates the composer', async () => {
    mockState.messages.directChatBootstrap = { error: null, stage: 'opening' }

    render(<ChatScreen />)
    await act(async () => {})

    expect(screen.getAllByText('MessageList').length).toBeGreaterThan(0)
    expect(screen.getByText('Securing chat...')).toBeTruthy()
    expect(screen.getByTestId('message-input').props.disabled).toBe(true)
  })

  it('keeps failed direct chats visibly unavailable with retry', async () => {
    mockState.messages.directChatBootstrap = {
      error: new Error('bundle unavailable'),
      stage: 'failed',
    }

    const view = render(<ChatScreen />)
    await act(async () => {})

    expect(screen.getAllByText('MessageList').length).toBeGreaterThan(0)
    expect(screen.getByText('bundle unavailable')).toBeTruthy()
    expect(screen.getByTestId('message-input').props.disabled).toBe(true)

    const retryButton = view.root.findAll((node) => (
      node.props.onPress === mockState.messages.handleRetryDirectChat
    ))[0]
    expect(retryButton).toBeTruthy()
    await fireEvent.press(retryButton!)

    expect(mockState.messages.handleRetryDirectChat).toHaveBeenCalledTimes(1)
  })

  it('shows the verified replacement action for direct chat identity migration', async () => {
    mockState.messages.directChatBootstrap = {
      error: new Error('Verify the safety number first'),
      stage: 'failed',
      identityReplacement: {
        reason: 'identity_replacement_required',
        oldIdentityId: 'identity-old',
        newIdentityId: 'identity-new',
        walletAddress: 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        safetyNumber,
        walletAuthorized: true,
      },
    }

    const view = render(<ChatScreen />)
    await act(async () => {})

    expect(screen.getByText('This wallet is valid, but it now advertises a new chat identity. This can happen after account import or recovery.')).toBeTruthy()
    expect(screen.getByText(safetyNumber.numeric)).toBeTruthy()
    const replaceButton = view.root.findAll((node) => (
      node.props.onPress === mockState.messages.handleAcceptDirectIdentityReplacement
    ))[0]
    expect(replaceButton).toBeTruthy()
    await fireEvent.press(replaceButton!)

    expect(mockState.messages.handleAcceptDirectIdentityReplacement).toHaveBeenCalledTimes(1)
    expect(mockState.messages.handleRetryDirectChat).not.toHaveBeenCalled()
  })

  it('opens the direct-chat call options menu from the header', async () => {
    render(<ChatScreen />)
    await act(async () => {})

    await act(async () => {
      fireEvent.press(screen.getByTestId('open-call-options'))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(screen.getByTestId('call-options-menu')).toBeTruthy()
  })

  it('disables the full-screen back swipe gesture on Android', async () => {
    ;(Platform as { OS: string }).OS = 'android'
    const view = render(<ChatScreen />)
    await act(async () => {})

    const gestureHost = view.root.find((node) => Boolean(node.props?.gestureConfig))

    expect(gestureHost.props.gestureConfig.enabled).toBe(false)
  })

  it('aligns once after the keyboard animation only near the bottom', async () => {
    vi.useFakeTimers()
    render(<ChatScreen />)
    await act(async () => {})

    await act(async () => {
      mockState.keyboardListeners.get('keyboardWillShow')?.({ duration: 240 })
      await vi.advanceTimersByTimeAsync(239)
    })
    expect(mockState.messageListRef.current.scrollToEnd).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(mockState.messageListRef.current.scrollToEnd).toHaveBeenCalledTimes(1)

    mockState.messageListProps?.onNearBottomChange(false)
    await act(async () => {
      mockState.keyboardListeners.get('keyboardWillShow')?.({ duration: 240 })
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(mockState.messageListRef.current.scrollToEnd).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('cancels pending keyboard alignment when message dragging begins', async () => {
    vi.useFakeTimers()
    render(<ChatScreen />)
    await act(async () => {})

    mockState.keyboardListeners.get('keyboardWillShow')?.({ duration: 240 })
    mockState.messageListProps?.onScrollBeginDrag()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })

    expect(mockState.messageListRef.current.scrollToEnd).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('dismisses the keyboard on background and relayouts the message list on resume', async () => {
    render(<ChatScreen />)
    await act(async () => {})

    expect(mockState.appStateListeners.length).toBeGreaterThan(0)
    expect(mockState.messageListProps?.extraData).toBe(0)

    await act(async () => {
      for (const listener of mockState.appStateListeners) {
        listener('background')
      }
    })
    expect(Keyboard.dismiss).toHaveBeenCalled()

    await act(async () => {
      for (const listener of mockState.appStateListeners) {
        listener('active')
      }
    })
    expect(mockState.messageListProps?.extraData).toBe(1)
    expect(mockState.messageListRef.current.scrollToEnd).toHaveBeenCalledWith({ animated: false })
  })

  it('relayouts the composer when top chrome height changes', async () => {
    mockState.topChromeHeight = 96
    const view = render(<ChatScreen />)
    await act(async () => {})

    expect(mockState.messageListProps?.extraData).toBe(0)

    mockState.topChromeHeight = 0
    view.update(<ChatScreen />)

    expect(mockState.messageListProps?.extraData).toBe(1)
    expect(mockState.messageListRef.current.scrollToEnd).toHaveBeenCalledWith({ animated: false })
  })

  it('relayouts the composer when first-contact chat setup finishes', async () => {
    mockState.messages.directChatBootstrap = { error: null, stage: 'opening' }
    const view = render(<ChatScreen />)
    await act(async () => {})

    expect(mockState.messageListProps?.extraData).toBe(0)

    mockState.messages.directChatBootstrap = { error: null, stage: 'ready' }
    view.update(<ChatScreen />)

    expect(mockState.messageListProps?.extraData).toBe(1)
    expect(mockState.messageListRef.current.scrollToEnd).toHaveBeenCalledWith({ animated: false })
  })

  it('opens the TRX wallet when a settled payment request is tapped', async () => {
    render(<ChatScreen />)
    await act(async () => {})

    await fireEvent.press(screen.getByTestId('paid-payment-request'))

    expect(mockState.router.dismissTo).toHaveBeenCalledWith({
      pathname: '/(main)/(tabs)/crypto',
      params: {
        network: 'tron',
        asset: 'TRX',
      },
    })
    expect(mockState.alerts).toEqual([])
  })
})

