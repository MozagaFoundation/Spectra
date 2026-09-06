/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { View, Text, Pressable, Alert, ActivityIndicator, AppState, Keyboard, Platform } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { KeyboardAvoidingView } from '@/components/ui/KeyboardAvoidingView'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { useIsFocused } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeColors } from '@/lib/theme'
import { useChatStore } from '@/store/chatStore'
import { useSpectreStore } from '@/store/spectreStore'
import { useWalletStore } from '@/store/walletStore'
import { MessageInput, type MessageInputHandle } from '@/components/chat/MessageInput'
import { MessageActionMenu } from '@/components/chat/MessageActionMenu'
import { CallOptionsMenu } from '@/components/chat/CallOptionsMenu'
import { TorDeliveryIndicator } from '@/components/chat/TorDeliveryIndicator'
import { BluetoothMessageDiagnostics } from '@/components/chat/BluetoothMessageDiagnostics'
import { IdentityReplacementVerification } from '@/components/common/IdentityReplacementVerification'
import {
  DIRECT_DISAPPEARING_TIMER_PRESETS_MS,
  getDisappearingTimerDescription,
  isDisappearingTimerEnabled,
} from '@/lib/disappearingMessages'
import {
  blockContact,
  clearConversationChat,
  deleteConversation,
  deleteConversationForBoth,
  isContactBlocked,
  resolveIdentityId,
  setConversationDisappearingTimer,
  sendMessage as sendChatMessage,
  unblockContact,
} from '@/services/chat/chatService'
import { activateChatPersonaByAddress } from '@/services/chat/personaSwitch'
import {
  getGroupIdFromRouteParam,
  isGroupRouteParam,
  sendGroupCryptoPaymentRequestUpdate,
  sendGroupMessage,
} from '@/services/groupChat'
import {
  applyCryptoPaymentRequestUpdate,
  getIdentity,
} from '@/services/quantumChat'
import {
  createChainCryptoReceiptMessage,
  resolveCryptoReceiptNetwork,
  type CryptoReceipt,
  type CryptoReceiptStatus,
} from '@/services/crypto/receipts'
import type { CryptoNetworkId } from '@/services/crypto/chainRegistry'
import { useScreenshotProtection } from '@/hooks/useScreenshotProtection'
import { isSameAccountStorageScope } from '@/lib/accountScope'
import { translate } from '@/lib/i18n'
import { useChatHeader } from '@/hooks/chatScreen/useChatHeader'
import { useChatMessages } from '@/hooks/chatScreen/useChatMessages'
import { ChatHeader } from '@/components/chatScreen/ChatHeader'
import { ChatMessageList } from '@/components/chatScreen/ChatMessageList'
import { useTopChromeHeight } from '@/contexts/TopChromeContext'
import type { GroupTransferRecipient } from '@/components/chat/GroupTransferRecipientModal'
import type { ChatMessage, MessageSendProgress } from '@/lib/types'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import {
  createCryptoPaymentRequestUpdate,
  type CryptoPaymentRequest,
  type CryptoPaymentRequestUpdate,
} from '@/services/shared/cryptoPaymentRequest'

const SendCryptoModal = React.lazy(async () => ({
  default: (await import('@/components/chat/SendCryptoModal')).SendCryptoModal,
}))
const ReceiveCryptoModal = React.lazy(async () => ({
  default: (await import('@/components/chat/ReceiveCryptoModal')).ReceiveCryptoModal,
}))
const HashtagModal = React.lazy(async () => ({
  default: (await import('@/components/chat/HashtagModal')).HashtagModal,
}))
const GroupTransferRecipientModal = React.lazy(async () => ({
  default: (await import('@/components/chat/GroupTransferRecipientModal')).GroupTransferRecipientModal,
}))
const ImageEditorModal = React.lazy(async () => ({
  default: (await import('@/components/media/ImageEditorModal')).ImageEditorModal,
}))
const ChatOptionsModal = React.lazy(async () => ({
  default: (await import('@/components/chat/ChatOptionsModal')).ChatOptionsModal,
}))

function DeferredMount({
  active,
  children,
}: {
  active: boolean
  children: React.ReactNode
}) {
  return active ? <React.Suspense fallback={null}>{children}</React.Suspense> : null
}

function getUploadProgressLabel(progress: MessageSendProgress): string {
  switch (progress.stage) {
    case 'attachment_upload':
      return translate('Encrypting and uploading {{completed}}/{{total}}', {
        ns: 'chat',
        completed: progress.completed,
        total: progress.total,
      })
    case 'preparing_message':
      return translate('Preparing message', { ns: 'chat' })
    case 'sending_message':
      return translate('Sending message', { ns: 'chat' })
    case 'caching_locally':
      return translate('Caching locally', { ns: 'chat' })
    case 'complete':
      return translate('Complete', { ns: 'chat' })
  }
}

export default function ChatScreen() {
  const router = useRouter()
  const isFocused = useIsFocused()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  useTranslation()
  const mutedConversationIds = useChatStore((state) => state.mutedConversationIds)
  const spectreEnabled = useSpectreStore((state) => state.enabled)
  const activeWalletAddress = useWalletStore((state) => state.wallet?.address ?? null)
  const activeWalletDisplayName = useWalletStore((state) => state.wallet?.displayName ?? null)
  const topChromeHeight = useTopChromeHeight()
  const { address, local, conversation } = useLocalSearchParams<{
    address: string
    local?: string
    conversation?: string
  }>()
  const routeLocalWalletAddress = typeof local === 'string' && local.length > 0 ? local : undefined
  const routeConversationId = typeof conversation === 'string' && conversation.length > 0
    ? conversation
    : undefined
  const keyboardAlignmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messageListNearBottomRef = useRef(true)

  const groupId = useMemo(() => getGroupIdFromRouteParam(address), [address])
  const isGroupChat = useMemo(() => isGroupRouteParam(address), [address])
  const routePersonaReady = isGroupChat
    || spectreEnabled
    || !routeLocalWalletAddress
    || isSameAccountStorageScope(activeWalletAddress, routeLocalWalletAddress)
  const [isActivatingRoutePersona, setIsActivatingRoutePersona] = useState(false)

  useEffect(() => {
    if (
      isGroupChat
      || spectreEnabled
      || !routeLocalWalletAddress
      || isSameAccountStorageScope(activeWalletAddress, routeLocalWalletAddress)
    ) {
      setIsActivatingRoutePersona(false)
      return
    }

    let cancelled = false
    setIsActivatingRoutePersona(true)

    activateChatPersonaByAddress(routeLocalWalletAddress).catch((error) => {
      if (cancelled) return
      Alert.alert(
        translate('Unable to switch EXO account'),
        getErrorDisplayMessage(error),
      )
    }).finally(() => {
      if (!cancelled) {
        setIsActivatingRoutePersona(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [activeWalletAddress, isGroupChat, routeLocalWalletAddress, spectreEnabled])

  const header = useChatHeader({
    address,
    localWalletAddress: routeLocalWalletAddress,
    isGroupChat,
    groupId,
  })
  const directIdentityId = header.conversation?.remoteIdentityId
    || header.contact?.identityId
    || null
  const handleDirectIdentityReplacementAccepted = useCallback((identityId: string) => {
    const localQuery = routeLocalWalletAddress
      ? `?local=${encodeURIComponent(routeLocalWalletAddress)}`
      : ''
    router.replace(`/(main)/chat/${identityId}${localQuery}`)
  }, [routeLocalWalletAddress, router])

  const msg = useChatMessages({
    address,
    localWalletAddress: routeLocalWalletAddress,
    directConversationId: routeConversationId,
    isFocused,
    isGroup: isGroupChat,
    groupId,
    contactName: header.contactName,
    contactWalletAddress: header.contact?.walletAddress,
    onDirectIdentityReplacementAccepted: handleDirectIdentityReplacementAccepted,
  })

  const chatBackSwipeGesture = useMemo(() => Gesture.Pan()
    .enabled(Platform.OS !== 'android')
    .runOnJS(true)
    .activeOffsetX([30, Number.MAX_SAFE_INTEGER])
    .failOffsetY([-25, 25])
    .onEnd((event) => {
      const horizontal = event.translationX
      const vertical = Math.abs(event.translationY)
      const velocity = event.velocityX
      const passedDistance = horizontal > 90 && horizontal > vertical * 1.35
      const passedFling = horizontal > 50 && velocity > 700 && horizontal > vertical
      if (!passedDistance && !passedFling) {
        return
      }

      Keyboard.dismiss()
      router.dismissTo('/(main)/(tabs)/chats' as Href)
    }), [router])
  const directChatFailed = !isGroupChat
    && msg.directChatBootstrap.stage === 'failed'
  const directChatOpening = !isGroupChat
    && msg.directChatBootstrap.stage !== 'ready'
    && !directChatFailed
  const directChatNeedsIdentityReplacement = directChatFailed
    && Boolean(msg.directChatBootstrap.identityReplacement)

  const cancelKeyboardAlignment = useCallback(() => {
    if (!keyboardAlignmentTimerRef.current) {
      return
    }
    clearTimeout(keyboardAlignmentTimerRef.current)
    keyboardAlignmentTimerRef.current = null
  }, [])

  const composerRef = useRef<MessageInputHandle>(null)
  const [layoutEpoch, setLayoutEpoch] = useState(0)
  const [keyboardAvoidanceEnabled, setKeyboardAvoidanceEnabled] = useState(true)
  const keyboardLayoutSignature = `${topChromeHeight}:${msg.directChatBootstrap.stage}:${directChatFailed ? 1 : 0}:${header.isBlocked ? 1 : 0}:${!routePersonaReady || isActivatingRoutePersona ? 1 : 0}`
  const previousKeyboardLayoutSignatureRef = useRef<string | null>(null)

  const handleMessageListNearBottomChange = useCallback((isNearBottom: boolean) => {
    messageListNearBottomRef.current = isNearBottom
  }, [])

  useEffect(() => {
    const handleKeyboardShow = (event?: { duration?: number }) => {
      cancelKeyboardAlignment()
      if (!messageListNearBottomRef.current) {
        return
      }
      const duration = Platform.OS === 'ios'
        ? (typeof event?.duration === 'number' && event.duration > 0 ? event.duration : 300)
        : 0
      keyboardAlignmentTimerRef.current = setTimeout(() => {
        keyboardAlignmentTimerRef.current = null
        if (messageListNearBottomRef.current) {
          msg.listRef.current?.scrollToEnd({ animated: false })
        }
      }, duration)
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSubscription = Keyboard.addListener(showEvent, handleKeyboardShow)
    const hideSubscription = Keyboard.addListener(hideEvent, cancelKeyboardAlignment)

    return () => {
      showSubscription.remove()
      hideSubscription.remove()
      cancelKeyboardAlignment()
    }
  }, [cancelKeyboardAlignment, msg.listRef])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'inactive' || nextState === 'background') {
        Keyboard.dismiss()
        composerRef.current?.blur()
        cancelKeyboardAlignment()
        if (nextState === 'background') {
          setKeyboardAvoidanceEnabled(false)
        }
        return
      }

      if (nextState !== 'active') {
        return
      }

      setKeyboardAvoidanceEnabled(true)
      setLayoutEpoch((epoch) => epoch + 1)
      requestAnimationFrame(() => {
        if (messageListNearBottomRef.current) {
          msg.listRef.current?.scrollToEnd({ animated: false })
        }
      })
    })

    return () => subscription.remove()
  }, [cancelKeyboardAlignment, msg.listRef])

  useEffect(() => {
    if (previousKeyboardLayoutSignatureRef.current === null) {
      previousKeyboardLayoutSignatureRef.current = keyboardLayoutSignature
      return
    }
    if (previousKeyboardLayoutSignatureRef.current === keyboardLayoutSignature) {
      return
    }
    previousKeyboardLayoutSignatureRef.current = keyboardLayoutSignature
    setLayoutEpoch((epoch) => epoch + 1)
    if (AppState.currentState !== 'active') {
      return
    }

    // Native iOS KAV keeps stale padding unless enabled is pulsed after chrome changes.
    setKeyboardAvoidanceEnabled(false)
    const frame = requestAnimationFrame(() => {
      if (AppState.currentState !== 'active') {
        return
      }
      setKeyboardAvoidanceEnabled(true)
      if (messageListNearBottomRef.current) {
        msg.listRef.current?.scrollToEnd({ animated: false })
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [keyboardLayoutSignature, msg.listRef])

  useScreenshotProtection(header.conversation?.id)

  const [showCallOptions, setShowCallOptions] = useState(false)
  const [showChatOptions, setShowChatOptions] = useState(false)
  const [showSendCrypto, setShowSendCrypto] = useState(false)
  const [showReceiveCrypto, setShowReceiveCrypto] = useState(false)
  const [showGroupTransferRecipientModal, setShowGroupTransferRecipientModal] = useState(false)
  const [showHashtagModal, setShowHashtagModal] = useState(false)
  const [selectedGroupTransferRecipient, setSelectedGroupTransferRecipient] = useState<GroupTransferRecipient | null>(null)
  const [selectedPaymentRequestMessage, setSelectedPaymentRequestMessage] = useState<ChatMessage | null>(null)
  const [selectedPaymentRequest, setSelectedPaymentRequest] = useState<CryptoPaymentRequest | null>(null)

  const closeCallOptions = useCallback(() => setShowCallOptions(false), [])
  const closeChatOptions = useCallback(() => setShowChatOptions(false), [])

  const handleSendCrypto = useCallback(() => {
    if (isGroupChat) {
      if (header.groupTransferRecipients.length === 0) {
        Alert.alert(
          translate('No eligible recipients'),
          translate('This group does not have any members with a wallet address to receive a transfer.'),
        )
        return
      }
      setShowGroupTransferRecipientModal(true)
      return
    }
    setShowSendCrypto(true)
  }, [header.groupTransferRecipients.length, isGroupChat])

  const handleReceiveCrypto = useCallback(() => {
    setShowReceiveCrypto(true)
  }, [])

  const handleCloseSendCrypto = useCallback(() => {
    setShowSendCrypto(false)
    setSelectedPaymentRequestMessage(null)
    setSelectedPaymentRequest(null)
    if (isGroupChat) {
      setSelectedGroupTransferRecipient(null)
    }
  }, [isGroupChat])

  const handleSelectGroupTransferRecipient = useCallback((recipient: GroupTransferRecipient) => {
    setSelectedGroupTransferRecipient(recipient)
    setShowGroupTransferRecipientModal(false)
    setShowSendCrypto(true)
  }, [])

  const sendDirectSpecialMessage = useCallback(async (content: string, failureLabel: string) => {
    if (!address || !header.exoAddress) return
    if (!routePersonaReady || isActivatingRoutePersona) {
      Alert.alert(translate('Chat unavailable'), translate('Please wait until this chat is ready.'))
      return
    }
    if (msg.directChatBootstrap.stage !== 'ready') {
      Alert.alert(
        translate('Chat unavailable'),
        msg.directChatBootstrap.error
          ? getErrorDisplayMessage(msg.directChatBootstrap.error)
          : translate('Please wait until this chat is ready.'),
      )
      return
    }

    const { error } = await sendChatMessage(header.exoAddress, address, content)
    if (error) {
      console.error(`Failed to send ${failureLabel}:`, error)
      Alert.alert(translate('Failed to send'), getErrorDisplayMessage(error))
    }
  }, [
    address,
    directChatFailed,
    header.exoAddress,
    isActivatingRoutePersona,
    msg.directChatBootstrap.error,
    msg.directChatBootstrap.stage,
    routePersonaReady,
  ])

  const handleCreateCryptoPaymentRequest = useCallback(async (content: string) => {
    if (isGroupChat && groupId) {
      const { error } = await sendGroupMessage(groupId, content)
      if (error) {
        Alert.alert(translate('Failed to send'), getErrorDisplayMessage(error))
      }
      return
    }

    await sendDirectSpecialMessage(content, 'crypto payment request')
  }, [groupId, isGroupChat, sendDirectSpecialMessage])

  const handleCryptoPaymentRequestPress = useCallback((message: ChatMessage, request: CryptoPaymentRequest) => {
    if (request.state === 'paid') {
      if (request.settlement?.txHash) {
        router.dismissTo({
          pathname: '/(main)/(tabs)/crypto',
          params: {
            network: request.network,
            asset: request.symbol.trim().toUpperCase(),
          },
        } as unknown as Href)
        return
      }

      Alert.alert(translate('Payment already submitted'), translate('This request has already been marked as paid.'))
      return
    }

    setSelectedPaymentRequestMessage(message)
    setSelectedPaymentRequest(request)
    setSelectedGroupTransferRecipient(null)
    setShowSendCrypto(true)
  }, [router])

  const selectedPaymentRequestRecipientName = useMemo(() => {
    if (!selectedPaymentRequest) return undefined

    const isGenericSelfLabel = (value?: string | null) => {
      const normalized = value?.trim().toLowerCase()
      return normalized === 'you' || normalized === translate('You').trim().toLowerCase()
    }

    if (selectedPaymentRequest.requesterName && !isGenericSelfLabel(selectedPaymentRequest.requesterName)) {
      return selectedPaymentRequest.requesterName
    }

    if (selectedPaymentRequestMessage?.senderName && !isGenericSelfLabel(selectedPaymentRequestMessage.senderName)) {
      return selectedPaymentRequestMessage.senderName
    }

    return isGroupChat ? undefined : header.contactName
  }, [
    header.contactName,
    isGroupChat,
    selectedPaymentRequest,
    selectedPaymentRequestMessage?.senderName,
  ])

  const markSelectedPaymentRequestPaid = useCallback(async (
    txHash: string,
    status: CryptoReceiptStatus,
  ) => {
    if (!selectedPaymentRequest || !selectedPaymentRequestMessage) return

    const updateContent = createCryptoPaymentRequestUpdate({
      requestId: selectedPaymentRequest.requestId,
      requestMessageId: selectedPaymentRequestMessage.id,
      payerIdentityId: getIdentity()?.id,
      network: selectedPaymentRequest.network,
      symbol: selectedPaymentRequest.symbol,
      amount: selectedPaymentRequest.amount,
      txHash,
      status,
      paidAt: Date.now(),
    })
    const update = JSON.parse(updateContent) as CryptoPaymentRequestUpdate

    if (isGroupChat && groupId) {
      const { error } = await sendGroupCryptoPaymentRequestUpdate(groupId, update)
      if (error) {
        console.error('Failed to send group payment request update:', error)
      }
      return
    }

    if (!address || !header.exoAddress) return
    await applyCryptoPaymentRequestUpdate(update, {
      conversationId: selectedPaymentRequestMessage.conversationId,
    })
    await sendDirectSpecialMessage(updateContent, 'payment request update')
  }, [address, groupId, header.exoAddress, isGroupChat, selectedPaymentRequest, selectedPaymentRequestMessage, sendDirectSpecialMessage])

  const handleTransactionSent = useCallback(async (
    symbol: string,
    amount: string,
    txHash: string,
    chainId?: CryptoNetworkId,
    status: CryptoReceiptStatus = 'confirmed',
  ) => {
    if (!chainId) {
      console.error('Failed to send crypto receipt message: missing chain id')
      return
    }

    if (selectedPaymentRequest) {
      if (status !== 'failed') {
        await markSelectedPaymentRequestPaid(txHash, status)
      }
      return
    }

    if (isGroupChat && groupId) {
      const targetRecipient = selectedGroupTransferRecipient

      const receiptMessage = createChainCryptoReceiptMessage(
        chainId,
        symbol,
        amount,
        txHash,
        targetRecipient?.identityId,
        targetRecipient?.name,
        status,
      )
      const { error } = await sendGroupMessage(groupId, receiptMessage)
      if (error) {
        console.error('Failed to send group crypto receipt message:', error)
      }
      return
    }

    const receiptMessage = createChainCryptoReceiptMessage(chainId, symbol, amount, txHash, undefined, undefined, status)
    await sendDirectSpecialMessage(receiptMessage, 'crypto receipt message')
  }, [groupId, isGroupChat, markSelectedPaymentRequestPaid, selectedGroupTransferRecipient, selectedPaymentRequest, sendDirectSpecialMessage])

  const handleCryptoReceiptPress = useCallback((receipt: CryptoReceipt) => {
    const network = resolveCryptoReceiptNetwork(receipt)
    router.dismissTo({
      pathname: '/(main)/(tabs)/crypto',
      params: {
        network,
        asset: receipt.symbol.trim().toUpperCase(),
      },
    } as unknown as Href)
  }, [router])

  const handleHashtag = useCallback(() => {
    setShowHashtagModal(true)
  }, [])

  const handleCloseHashtag = useCallback(() => {
    setShowHashtagModal(false)
  }, [])

  const directTimerLabel = useMemo(() => {
    if (isGroupChat || !isDisappearingTimerEnabled(header.conversation?.disappearingTimer)) {
      return undefined
    }
    return getDisappearingTimerDescription(header.conversation?.disappearingTimer)
  }, [header.conversation?.disappearingTimer, isGroupChat])

  const handleSelectDisappearingTimer = useCallback(async (durationMs: number | null) => {
    if (!address || isGroupChat) {
      return
    }

    const result = await setConversationDisappearingTimer(
      address,
      durationMs ? { durationMs, trigger: 'after_read' } : null,
    )
    if (result.error) {
      Alert.alert(translate('Could not update timer'), getErrorDisplayMessage(result.error))
    }
  }, [address, isGroupChat])

  const handleMuteConversation = useCallback(() => {
    if (!header.conversation?.id) return
    useChatStore.getState().toggleMuteConversation(header.conversation.id)
    closeChatOptions()
  }, [closeChatOptions, header.conversation?.id])

  const handleClearConversation = useCallback(() => {
    if (!header.conversation?.id) return
    closeChatOptions()
    Alert.alert(translate('Clear Chat'), translate('This will remove all messages in this chat. This cannot be undone.'), [
      { text: translate('Cancel'), style: 'cancel' },
      {
        text: translate('Clear'),
        style: 'destructive',
        onPress: async () => {
          const result = await clearConversationChat(header.conversation!.id)
          if (result.error) {
            Alert.alert(translate('Could not clear chat'), getErrorDisplayMessage(result.error))
          }
        },
      },
    ])
  }, [closeChatOptions, header.conversation])

  const handleDeleteConversation = useCallback(() => {
    if (!header.conversation || isGroupChat) return
    closeChatOptions()
    Alert.alert(
      translate('Delete Chat'),
      translate('Choose whether to remove this conversation only from this device or for both participants.'),
      [
        { text: translate('Cancel'), style: 'cancel' },
        {
          text: translate('Delete for me'),
          style: 'destructive',
          onPress: async () => {
            const result = await deleteConversation(header.conversation!.id)
            if (result.error) {
              Alert.alert(translate('Could not delete chat'), getErrorDisplayMessage(result.error))
            } else {
              router.back()
            }
          },
        },
        {
          text: translate('Delete for both'),
          style: 'destructive',
          onPress: async () => {
            const result = await deleteConversationForBoth(
              header.conversation!.id,
              header.conversation!.remoteIdentityId,
            )
            if (result.error) {
              Alert.alert(translate('Could not delete chat'), getErrorDisplayMessage(result.error))
            } else {
              router.back()
            }
          },
        },
      ],
    )
  }, [closeChatOptions, header.conversation, isGroupChat, router])

  const handleBlockConversation = useCallback(() => {
    if (!address || !header.conversation?.remoteIdentityId || isGroupChat) return
    const identityId = header.conversation.remoteIdentityId
    const blocked = isContactBlocked(identityId)
    closeChatOptions()
    Alert.alert(
      translate(blocked ? 'Unblock Contact' : 'Block Contact'),
      blocked
        ? translate('They will be able to send you messages again.')
        : translate('You will no longer receive messages from this contact.'),
      [
        { text: translate('Cancel'), style: 'cancel' },
        {
          text: translate(blocked ? 'Unblock' : 'Block'),
          style: 'destructive',
          onPress: async () => {
            const result = blocked ? await unblockContact(address) : await blockContact(address)
            if (result.error) {
              Alert.alert(
                translate(blocked ? 'Could not unblock contact' : 'Could not block contact'),
                getErrorDisplayMessage(result.error),
              )
            }
          },
        },
      ],
    )
  }, [address, closeChatOptions, header.conversation, isGroupChat])

  const composerAccessory = useMemo(() => {
    if (!header.torEnabled && !msg.uploadProgress) {
      return undefined
    }

    return (
      <View className="pb-2">
        {header.torEnabled ? (
          <TorDeliveryIndicator isGroupChat={isGroupChat} />
        ) : null}
        {msg.uploadProgress ? (
          <View
            className="rounded-xl border px-3 py-2"
            style={{
              borderColor: colors.primary + '33',
              backgroundColor: colors.primary + '10',
            }}
          >
            <View className="flex-row items-center justify-between">
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>
                {translate('Sending attachment', { ns: 'chat' })}
              </Text>
              <Text className="text-text-muted text-xs">
                {`${Math.max(0, Math.min(100, msg.uploadProgress.percentage))}%`}
              </Text>
            </View>
            <Text className="text-text-muted text-xs mt-1">
              {getUploadProgressLabel(msg.uploadProgress)}
            </Text>
            <View
              className="mt-2 h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: colors.border }}
            >
              <View
                style={{
                  width: `${Math.max(6, Math.min(100, msg.uploadProgress.percentage))}%`,
                  height: '100%',
                  backgroundColor: colors.primary,
                }}
              />
            </View>
          </View>
        ) : null}
      </View>
    )
  }, [
    msg.uploadProgress,
    colors.border,
    colors.primary,
    header.torEnabled,
    isGroupChat,
  ])

  return (
    <GestureDetector gesture={chatBackSwipeGesture}>
      <View
        className="flex-1 bg-background"
        style={{ backgroundColor: colors.background }}
      >
        <KeyboardAvoidingView
          behavior="padding"
          keyboardVerticalOffset={topChromeHeight}
          enabled={keyboardAvoidanceEnabled}
          style={{ flex: 1 }}
        >
        <ChatHeader
          address={address}
          isGroupChat={isGroupChat}
          groupId={groupId}
          contactName={header.contactName}
          contactAvatarUrl={header.contactAvatarUrl}
          isBlocked={header.isBlocked}
          remoteAccountDeleted={header.remoteAccountDeleted}
          contactIsOnline={header.contact?.isOnline}
          bleRoute={header.bleRoute}
          isPeerNearby={header.isPeerNearby}
          internetAvailable={header.internetAvailable}
          torEnabled={header.torEnabled}
          peerTorCallAlert={header.peerTorCallAlert}
          groupMemberCount={header.groupConversation?.memberCount || header.groupMembers.length}
          disappearingTimerLabel={directTimerLabel}
          localDisplayName={header.conversation?.localDisplayName}
          localWalletAddress={header.conversation?.localWalletAddress || routeLocalWalletAddress}
          onOpenOptions={!isGroupChat ? () => setShowChatOptions(true) : undefined}
          onOpenCallOptions={!isGroupChat && !header.remoteAccountDeleted
            ? () => setShowCallOptions(true)
            : undefined}
        />

        {header.isBlocked && (
          <View className="px-4 py-3 flex-row items-center justify-between" style={{ backgroundColor: colors.error + '1A' }}>
            <Text className="text-error text-sm flex-1">{translate('You have blocked this contact.')}</Text>
            <Pressable onPress={header.handleUnblock} className="bg-surface px-3 py-1.5 rounded-lg">
              <Text className="text-text text-sm font-medium">{translate('Unblock')}</Text>
            </Pressable>
          </View>
        )}

        {!routePersonaReady || isActivatingRoutePersona ? (
          <View className="px-4 py-2 flex-row items-center gap-2" style={{ backgroundColor: colors.primary + '12' }}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text className="text-text-muted text-sm">
              {translate('Switching EXO account...')}
            </Text>
          </View>
        ) : null}

        {directChatFailed ? (
          directChatNeedsIdentityReplacement && msg.directChatBootstrap.identityReplacement ? (
            <View className="px-4 py-2">
              <IdentityReplacementVerification
                replacement={msg.directChatBootstrap.identityReplacement}
                onAccept={msg.handleAcceptDirectIdentityReplacement}
              />
            </View>
          ) : (
            <View
              className="px-4 py-2 flex-row items-center gap-3"
              style={{ backgroundColor: colors.error + '1A' }}
            >
              <Text className="text-sm flex-1" style={{ color: colors.error }}>
                {msg.directChatBootstrap.error
                  ? getErrorDisplayMessage(msg.directChatBootstrap.error)
                  : translate('Chat unavailable')}
              </Text>
              <Pressable
                onPress={msg.handleRetryDirectChat}
                className="bg-surface px-3 py-1.5 rounded-lg"
              >
                <Text className="text-text text-sm font-medium">
                  {translate('Retry')}
                </Text>
              </Pressable>
            </View>
          )
        ) : null}

        {!isGroupChat && directIdentityId ? (
          <BluetoothMessageDiagnostics
            peerIdentityId={directIdentityId}
            active={header.isPeerNearby || header.bleRoute !== 'internet'}
          />
        ) : null}

        <View style={{ flex: 1 }}>
          <ChatMessageList
            conversationKey={`${address || 'unknown'}:${routeLocalWalletAddress || activeWalletAddress || 'active'}:${routeConversationId || 'none'}`}
            listRef={msg.listRef}
            data={msg.flatListData}
            extraData={layoutEpoch}
            isLoading={msg.isLoading}
            isSyncing={msg.isSyncing}
            isGroupChat={isGroupChat}
            hasOlderMessages={msg.hasOlderMessages}
            isLoadingOlder={msg.isLoadingOlder}
            onLoadOlder={msg.handleLoadOlder}
            contactName={header.contactName}
            contactAvatarUrl={header.contactAvatarUrl}
            contacts={header.contacts}
            groupMembers={header.groupMembers}
            onNearBottomChange={handleMessageListNearBottomChange}
            onScrollBeginDrag={cancelKeyboardAlignment}
            onMessageLongPress={msg.handleMessageLongPress}
            onReplyPress={msg.handleReplyPreviewPress}
            onRevealViewOnce={msg.handleRevealViewOnce}
            onConsumeViewOnce={msg.handleConsumeViewOnce}
            onRetryFailedMessage={msg.handleRetryFailedMessage}
            onEditImageAttachment={msg.handleEditImageAttachment}
            onCryptoReceiptPress={handleCryptoReceiptPress}
            onCryptoPaymentRequestPress={handleCryptoPaymentRequestPress}
          />
        </View>

        <View style={{ paddingBottom: insets.bottom, backgroundColor: colors.backgroundSecondary }}>
          {header.isBlocked ? (
            <View
              className="border-t px-4 py-4 items-center"
              style={{ backgroundColor: colors.backgroundSecondary, borderTopColor: colors.border }}
            >
              <Text className="text-text-muted text-sm">
                {translate('You cannot send messages to a blocked contact.')}
              </Text>
            </View>
          ) : (
            <MessageInput
              composerRef={composerRef}
              onSend={msg.handleSend}
              disabled={!routePersonaReady || isActivatingRoutePersona || directChatOpening || directChatFailed}
              allowViewOnce={!isGroupChat}
              placeholder={
                !routePersonaReady || isActivatingRoutePersona
                  ? translate('Switching EXO account...')
                  : directChatFailed
                    ? translate('Chat unavailable')
                    : directChatOpening
                      ? (
                          msg.directHistoryReady
                            ? translate('Preparing secure channel...')
                            : translate('Securing chat...')
                        )
                      : undefined
              }
              textOnlyMode={header.isBluetoothMeshMode}
              accessory={composerAccessory}
              onSendCrypto={handleSendCrypto}
              onReceiveCrypto={handleReceiveCrypto}
              onHashtag={isGroupChat ? undefined : handleHashtag}
              replyTo={msg.replyTo}
              onCancelReply={msg.handleCancelReply}
            />
          )}
        </View>
      </KeyboardAvoidingView>

      <DeferredMount active={msg.actionMenuVisible}>
          <MessageActionMenu
            visible={msg.actionMenuVisible}
            message={msg.actionMenuMessage}
            isOwn={msg.actionMenuIsOwn}
            onClose={msg.handleCloseActionMenu}
            onReaction={msg.handleReaction}
            onReply={msg.handleReply}
            onDelete={msg.handleDelete}
            onRetry={() => {
              if (msg.actionMenuMessage) {
                void msg.handleRetryFailedMessage(msg.actionMenuMessage)
              }
            }}
          />
        </DeferredMount>
        <DeferredMount active={Boolean(msg.editingImageAttachment)}>
          <ImageEditorModal
            visible={Boolean(msg.editingImageAttachment)}
            attachment={msg.editingImageAttachment}
            title={translate('Edit and resend')}
            onCancel={msg.handleCancelImageEdit}
            onSave={msg.handleSaveEditedImageAttachment}
          />
        </DeferredMount>
        <DeferredMount active={!isGroupChat && showCallOptions}>
          <CallOptionsMenu
            visible={showCallOptions}
            onClose={closeCallOptions}
            onStartCall={header.handleStartCall}
            contactName={header.contactName}
            disabled={Boolean(header.peerTorCallAlert)}
            disabledReason={header.peerTorCallAlert?.reason}
          />
        </DeferredMount>
        <DeferredMount active={!isGroupChat && showChatOptions}>
          <ChatOptionsModal
            visible={showChatOptions}
            conversation={header.conversation}
            isMuted={header.conversation ? mutedConversationIds.includes(header.conversation.id) : false}
            isBlocked={Boolean(header.conversation?.remoteIdentityId && isContactBlocked(header.conversation.remoteIdentityId))}
            onClose={closeChatOptions}
            onMute={handleMuteConversation}
            onClearChat={handleClearConversation}
            onDeleteChat={handleDeleteConversation}
            onBlock={handleBlockConversation}
            disappearingTimerLabel={directTimerLabel || 'Off'}
            disappearingTimerPresets={DIRECT_DISAPPEARING_TIMER_PRESETS_MS}
            onSelectDisappearingTimer={handleSelectDisappearingTimer}
          />
        </DeferredMount>
        <DeferredMount active={showGroupTransferRecipientModal}>
          <GroupTransferRecipientModal
            visible={showGroupTransferRecipientModal}
            recipients={header.groupTransferRecipients}
            onClose={() => setShowGroupTransferRecipientModal(false)}
            onSelect={handleSelectGroupTransferRecipient}
          />
        </DeferredMount>
        <DeferredMount active={showSendCrypto}>
          <SendCryptoModal
            visible={showSendCrypto}
            onClose={handleCloseSendCrypto}
            recipientAddress={selectedPaymentRequest?.recipientAddress || selectedGroupTransferRecipient?.walletAddress || header.contact?.walletAddress || ''}
            recipientName={selectedPaymentRequest ? selectedPaymentRequestRecipientName : selectedGroupTransferRecipient?.name || header.contactName}
            paymentRequest={selectedPaymentRequest}
            onTransactionSent={handleTransactionSent}
          />
        </DeferredMount>
        <DeferredMount active={showReceiveCrypto}>
          <ReceiveCryptoModal
            visible={showReceiveCrypto}
            onClose={() => setShowReceiveCrypto(false)}
            onCreate={handleCreateCryptoPaymentRequest}
            requesterIdentityId={getIdentity()?.id}
            requesterName={activeWalletDisplayName || undefined}
          />
        </DeferredMount>
        <DeferredMount active={showHashtagModal}>
          <HashtagModal
            visible={showHashtagModal}
            onClose={handleCloseHashtag}
            contactIdentityId={resolveIdentityId(header.contact?.identityId || address || '')}
            contactWalletAddress={header.contact?.walletAddress || (address?.startsWith('EXO') ? address : undefined)}
            contactName={header.contactName}
          />
      </DeferredMount>
      </View>
    </GestureDetector>
  )
}
