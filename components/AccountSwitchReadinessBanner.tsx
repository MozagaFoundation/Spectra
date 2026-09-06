/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Pressable, Text, View } from 'react-native'
import { CheckCircle2, CircleAlert, RefreshCw, RotateCcw } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import { initializeChat, cleanupChat } from '@/services/chat'
import { activateChatPersona } from '@/services/chat/personaSwitch'
import {
  ensureActiveChatIdentityReady,
  getIdentity,
  isQuantumChatInitialized,
} from '@/services/quantumChat'
import { getRootExoWallet } from '@/services/wallet'
import { useAccountReadinessStore } from '@/store/accountReadinessStore'
import { useWalletStore } from '@/store/walletStore'

type ReadinessKey = 'quantum' | 'e2e' | 'session' | 'identity'
type ReadinessStatus = 'checking' | 'ready' | 'error'

type ReadinessState = Record<ReadinessKey, ReadinessStatus>

const INITIAL_STATE: ReadinessState = {
  quantum: 'checking',
  e2e: 'checking',
  session: 'checking',
  identity: 'checking',
}

const READY_STATE: ReadinessState = {
  quantum: 'ready',
  e2e: 'ready',
  session: 'ready',
  identity: 'ready',
}

const CHAT_IDENTITY_WAIT_MS = 15_000
const AUTO_DISMISS_MS = 800

interface AccountSwitchReadinessBannerProps {
  includeTopInset?: boolean
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isIdentityForWallet(
  walletAddress: string,
  identity: ReturnType<typeof getIdentity>,
): boolean {
  return identity?.blockchainAddress === walletAddress
}

function countByStatus(state: ReadinessState) {
  const keys = Object.keys(state) as ReadinessKey[]
  let ready = 0
  let error = 0
  for (const key of keys) {
    if (state[key] === 'ready') ready++
    else if (state[key] === 'error') error++
  }
  return { total: keys.length, ready, error }
}

export function AccountSwitchReadinessBanner({
  includeTopInset = true,
}: AccountSwitchReadinessBannerProps) {
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()

  const wallet = useAccountReadinessStore((s) => s.wallet)
  const rootWallet = useAccountReadinessStore((s) => s.rootWallet)
  const dismiss = useAccountReadinessStore((s) => s.dismiss)

  const wallets = useWalletStore((s) => s.wallets)

  const visible = wallet !== null
  const targetIsRoot = Boolean(wallet && rootWallet && wallet.id === rootWallet.id)

  const runIdRef = useRef(0)
  const slideAnim = useRef(new Animated.Value(-250)).current
  const [mounted, setMounted] = useState(false)
  const [status, setStatus] = useState<ReadinessState>(INITIAL_STATE)
  const [detail, setDetail] = useState<string | null>(null)
  const [isRecovering, setIsRecovering] = useState(false)

  const { total, ready, error } = countByStatus(status)
  const hasError = error > 0
  const allReady = ready === total

  const slideIn = useCallback(() => {
    setMounted(true)
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start()
  }, [slideAnim])

  const slideOut = useCallback(
    (afterDone?: () => void) => {
      Animated.timing(slideAnim, {
        toValue: -250,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        setMounted(false)
        afterDone?.()
      })
    },
    [slideAnim],
  )

  const updateStatus = useCallback(
    (key: ReadinessKey, nextStatus: ReadinessStatus) => {
      setStatus((current) => ({ ...current, [key]: nextStatus }))
    },
    [],
  )

  const markRemainingAsError = useCallback(() => {
    setStatus((current) => {
      const next = { ...current }
      for (const key of Object.keys(next) as ReadinessKey[]) {
        if (next[key] === 'checking') next[key] = 'error'
      }
      return next
    })
  }, [])

  const runReadinessCheck = useCallback(
    async (options?: { forceReconnect?: boolean }) => {
      if (!wallet) return

      const runId = runIdRef.current + 1
      runIdRef.current = runId
      setStatus(INITIAL_STATE)
      setDetail(null)
      setIsRecovering(Boolean(options?.forceReconnect))

      const isCurrentRun = () => runIdRef.current === runId

      try {
        if (options?.forceReconnect) {
          cleanupChat()
          await activateChatPersona(wallet.id, { verifyCloudBinding: false })
        }

        const waitStartedAt = Date.now()
        let identity = getIdentity()

        while (
          isCurrentRun() &&
          (!isQuantumChatInitialized() || !isIdentityForWallet(wallet.address, identity))
        ) {
          if (!isQuantumChatInitialized()) {
            await initializeChat()
          }

          identity = getIdentity()
          if (isIdentityForWallet(wallet.address, identity)) break

          if (Date.now() - waitStartedAt >= CHAT_IDENTITY_WAIT_MS) {
            throw new Error(
              translate('Chat identity did not finish switching. Try reconnecting.'),
            )
          }

          await sleep(250)
        }

        if (!isCurrentRun()) return
        identity = getIdentity()
        if (!identity?.id || !isIdentityForWallet(wallet.address, identity)) {
          throw new Error(
            translate('Chat identity is not ready for this EXO account.'),
          )
        }

        updateStatus('quantum', 'ready')
        updateStatus('e2e', 'ready')

        const readiness = await ensureActiveChatIdentityReady()
        if (!isCurrentRun()) return
        if (!readiness.sessionReady) {
          updateStatus('session', 'error')
          throw new Error(
            readiness.error || translate('Could not verify the server session for this EXO account.'),
          )
        }
        updateStatus('session', 'ready')

        if (!readiness.identityBound) {
          updateStatus('identity', 'error')
          throw new Error(
            readiness.error || translate('Could not link this chat identity to the server.'),
          )
        }
        updateStatus('identity', 'ready')
        setStatus(READY_STATE)
        setDetail(null)
      } catch (err) {
        if (!isCurrentRun()) return
        markRemainingAsError()
        setDetail(
          err instanceof Error
            ? err.message
            : translate('Could not prepare this EXO account.'),
        )
      } finally {
        if (isCurrentRun()) {
          setIsRecovering(false)
        }
      }
    },
    [markRemainingAsError, updateStatus, wallet],
  )

  useEffect(() => {
    if (!visible) {
      runIdRef.current += 1
      slideOut()
      setStatus(INITIAL_STATE)
      setDetail(null)
      setIsRecovering(false)
      return
    }

    slideIn()
    void runReadinessCheck()

    return () => {
      runIdRef.current += 1
    }
  }, [runReadinessCheck, slideIn, slideOut, visible])

  useEffect(() => {
    if (!visible || !allReady) return

    const timer = setTimeout(() => {
      slideOut(() => dismiss())
    }, AUTO_DISMISS_MS)

    return () => clearTimeout(timer)
  }, [allReady, dismiss, slideOut, visible])

  const handleTryReconnect = useCallback(() => {
    void runReadinessCheck({ forceReconnect: true })
  }, [runReadinessCheck])

  const handleBackToRoot = useCallback(async () => {
    const currentRoot = getRootExoWallet(wallets)
    if (!currentRoot) return

    setIsRecovering(true)
    setDetail(null)
    try {
      cleanupChat()
      await activateChatPersona(currentRoot.id)
      dismiss()
    } catch (err) {
      markRemainingAsError()
      setDetail(
        err instanceof Error
          ? err.message
          : translate('Could not switch back to the root EXO account.'),
      )
      setIsRecovering(false)
    }
  }, [dismiss, markRemainingAsError, wallets])

  if (!mounted) return null

  return (
    <Animated.View
      style={{
        backgroundColor: 'transparent',
        paddingTop: includeTopInset ? insets.top + 8 : 0,
        paddingBottom: 12,
        transform: [{ translateY: slideAnim }],
      }}
    >
      <View
        style={{
          marginHorizontal: 12,
          borderRadius: 16,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: hasError
            ? colors.error + '44'
            : allReady
              ? colors.success + '44'
              : colors.border,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 14,
            paddingVertical: 12,
            gap: 10,
          }}
        >
          {allReady ? (
            <CheckCircle2 size={18} color={colors.success} />
          ) : hasError ? (
            <CircleAlert size={18} color={colors.error} />
          ) : (
            <ActivityIndicator size="small" color={colors.primary} />
          )}

          <Text
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: '600',
              color: colors.text,
            }}
            numberOfLines={1}
          >
            {allReady
              ? translate('Account ready')
              : hasError
                ? translate('Connection problem')
                : translate('Connecting securely...')}
          </Text>

          {!hasError && !allReady ? (
            <Text style={{ fontSize: 12, color: colors.textMuted }}>
              {ready}/{total}
            </Text>
          ) : null}
        </View>

        {hasError ? (
          <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
            {detail ? (
              <Text
                style={{ fontSize: 12, color: colors.error, marginBottom: 10 }}
              >
                {detail}
              </Text>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={handleTryReconnect}
                disabled={isRecovering}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: colors.primary,
                  opacity: isRecovering ? 0.6 : 1,
                }}
              >
                {isRecovering ? (
                  <ActivityIndicator size="small" color={colors.textOnPrimary} />
                ) : (
                  <RefreshCw size={14} color={colors.textOnPrimary} />
                )}
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: colors.textOnPrimary,
                  }}
                >
                  {translate('Retry')}
                </Text>
              </Pressable>

              {!targetIsRoot && rootWallet ? (
                <Pressable
                  onPress={() => void handleBackToRoot()}
                  disabled={isRecovering}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 10,
                    borderRadius: 10,
                    backgroundColor: colors.background,
                    borderWidth: 1,
                    borderColor: colors.border,
                    opacity: isRecovering ? 0.6 : 1,
                  }}
                >
                  <RotateCcw size={14} color={colors.text} />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: colors.text,
                    }}
                  >
                    {translate('Root account')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </Animated.View>
  )
}
