/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useCallback, useState } from 'react'
import { Alert } from 'react-native'
import * as Haptics from 'expo-haptics'
import { Trash2 } from 'lucide-react-native'

import { PinEntryScreen } from '@/components/settings/PinEntryScreen'
import { PinInput } from '@/components/wallet'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import {
  deleteAccountPermanently,
} from '@/services/accountLifecycle/permanentAccountDeletion'
import { wipeAllSensitiveData } from '@/services/accountLifecycle/accountTeardown'
import { hasVerifiedBackendAccess } from '@/services/backend/session'
import {
  formatGuardedPinLockoutMessage,
  verifyPinWithAttemptGuard,
  type GuardedPinResult,
} from '@/services/security/pinAttemptGuard'
import { useAccountDeletionStore } from '@/store/accountDeletionStore'
import { useWalletStore } from '@/store/walletStore'

interface AccountRemovalFlowProps {
  children: (controls: {
    requestAccountRemoval: () => void
    isDeleting: boolean
  }) => React.ReactNode
}

export function AccountRemovalFlow({ children }: AccountRemovalFlowProps) {
  const { verifyPin } = useWalletStore()
  const colors = useThemeColors()
  const [pinEntryVisible, setPinEntryVisible] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleGuardedPinFailure = useCallback(async (
    result: Exclude<GuardedPinResult, { status: 'valid' }>,
  ) => {
    if (result.status === 'wipe_required') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      await wipeAllSensitiveData({ purgeBackendAccount: true })
      return
    }

    if (result.status === 'locked') {
      setPinError(formatGuardedPinLockoutMessage(result.lockoutUntil, translate))
    } else {
      setPinError(translate('lockout.remainingAttempts', {
        ns: 'auth',
        count: result.remainingAttempts,
      }))
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
  }, [])

  const requestAccountRemoval = useCallback(() => {
    if (!hasVerifiedBackendAccess()) {
      Alert.alert(
        translate('Cloud Session Required', { ns: 'settings' }),
        translate('Unlock or reconnect to the backend before deleting the account.', {
          ns: 'settings',
        }),
      )
      return
    }

    Alert.alert(
      translate('Log Out', { ns: 'settings' }),
      translate(
        'This deletes local keys and data first, then submits backend cleanup over your current private transport. A progress screen remains visible until cleanup is confirmed.',
        { ns: 'settings' },
      ),
      [
        { text: translate('Cancel', { ns: 'common' }), style: 'cancel' },
        {
          text: translate('Continue', { ns: 'settings' }),
          style: 'destructive',
          onPress: () => {
            setPinError(null)
            setPinEntryVisible(true)
          },
        },
      ],
    )
  }, [])

  const handlePinComplete = useCallback(async (pin: string) => {
    setPinError(null)
    const result = await verifyPinWithAttemptGuard(pin, verifyPin)
    if (result.status !== 'valid') {
      await handleGuardedPinFailure(result)
      return
    }
    setPinEntryVisible(false)

    Alert.alert(
      translate('Erase Account Permanently?', { ns: 'settings' }),
      translate('This cannot be undone. Local sensitive data is erased before the backend deletion request starts.', {
        ns: 'settings',
      }),
      [
        { text: translate('Cancel', { ns: 'common' }), style: 'cancel' },
        {
          text: translate('Erase Everything', { ns: 'settings' }),
          style: 'destructive',
          onPress: async () => {
            if (!hasVerifiedBackendAccess()) {
              Alert.alert(
                translate('Cloud Session Required', { ns: 'settings' }),
                translate('Unlock or reconnect to the backend before deleting the account.', {
                  ns: 'settings',
                }),
              )
              return
            }

            setIsDeleting(true)
            try {
              await deleteAccountPermanently()
              const phase = useAccountDeletionStore.getState().phase
              await Haptics.notificationAsync(
                phase === 'completed'
                  ? Haptics.NotificationFeedbackType.Success
                  : Haptics.NotificationFeedbackType.Error,
              )
            } catch {
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
            } finally {
              setIsDeleting(false)
            }
          },
        },
      ],
    )
  }, [handleGuardedPinFailure, verifyPin])

  if (pinEntryVisible) {
    return (
      <PinEntryScreen
        title={translate('Enter PIN', { ns: 'settings' })}
        onBack={() => {
          setPinEntryVisible(false)
          setPinError(null)
        }}
        icon={<Trash2 size={32} color={colors.error} />}
        iconBackgroundColor={colors.error + '26'}
        heading={translate('Confirm Account Deletion', { ns: 'settings' })}
        description={translate('Enter your PIN to continue to the final destructive confirmation.', {
          ns: 'settings',
        })}
        descriptionClassName="text-error text-center mb-8 max-w-[300px]"
      >
        <PinInput
          key="account-delete-pin"
          onComplete={handlePinComplete}
          error={pinError || undefined}
          label={translate('Enter your current PIN', { ns: 'settings' })}
        />
      </PinEntryScreen>
    )
  }

  return <>{children({ requestAccountRemoval, isDeleting })}</>
}
