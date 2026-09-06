/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { Text, View } from 'react-native'
import { AlertTriangle, Bluetooth, CheckCircle2 } from 'lucide-react-native'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import { useBluetoothStore } from '@/store/bluetoothStore'
import {
  describeBLEDiagnosticCause,
  describeBLEDiagnosticStopStage,
  describeBLEHandshakeProgressLabel,
  isBLESessionDiagnosticFailure,
} from '@/services/bluetooth/diagnostics'
import type {
  BLEMessageDiagnosticFailure,
  BLEMessageDiagnosticStage,
} from '@/services/bluetooth/messageDiagnostics'

const VISIBILITY_MS = 5 * 60_000

const STAGE_LABELS: Record<BLEMessageDiagnosticStage, string> = {
  route_selected: 'Bluetooth route selected',
  route_pair_ready: 'Secure route capability ready',
  transmitting: 'Transmitting encrypted message',
  transmitted: 'Encrypted message transmitted',
  awaiting_receipt: 'Waiting for receiver receipt',
  assembling: 'Receiving encrypted message frames',
  envelope_verified: 'Route envelope authenticated',
  chat_processing: 'Decrypting and saving message',
  persisted: 'Message saved on this phone',
  sending_receipt: 'Returning authenticated receipt',
  receipt_sent: 'Authenticated receipt sent',
  receipt_received: 'Delivered over Bluetooth',
  failed: 'Bluetooth message halted',
}

const FAILURE_LABELS: Record<BLEMessageDiagnosticFailure, string> = {
  route_capability_unavailable: 'No secure route capability is available.',
  receipt_limit_reached: 'Too many Bluetooth messages are awaiting receipts.',
  route_capability_expiring: 'The secure route capability expired before sending.',
  message_encoding_failed: 'The encrypted message could not be encoded for Bluetooth.',
  authenticated_link_unavailable: 'The authenticated nearby link stopped before transmission.',
  message_transmission_failed: 'The encrypted frames did not finish transmitting.',
  direct_frame_rejected: 'The received Bluetooth frame sequence was rejected.',
  route_not_recognized: 'The receiver did not recognize this secure route capability.',
  envelope_authentication_failed: 'The receiver rejected the route envelope authentication.',
  encrypted_message_invalid: 'The receiver rejected the encrypted message structure.',
  chat_processing_failed: 'The receiver could not decrypt or save the message.',
  receipt_send_failed: 'The receiver accepted the message but could not return its receipt.',
  receipt_timeout: 'The message was transmitted, but no authenticated receipt returned within 20 seconds.',
}

interface BluetoothMessageDiagnosticsProps {
  peerIdentityId: string
  active: boolean
}

export const BluetoothMessageDiagnostics = React.memo(
  function BluetoothMessageDiagnostics({
    peerIdentityId,
    active,
  }: BluetoothMessageDiagnosticsProps) {
    const colors = useThemeColors()
    const [, setExpiryTick] = React.useState(0)
    const diagnostics = useBluetoothStore((state) => (
      state.messageDiagnostics[peerIdentityId] ?? null
    ))
    const radioFailure = useBluetoothStore((state) => state.diagnostics.lastFailure)
    const radioCause = useBluetoothStore((state) => (
      state.diagnostics.lastFailure
        ? describeBLEDiagnosticCause(state.diagnostics)
        : ''
    ))
    const radioStopStage = useBluetoothStore((state) => (
      state.diagnostics.lastFailure
        ? describeBLEDiagnosticStopStage(state.diagnostics.furthestStage)
        : ''
    ))
    const radioNoiseProgress = useBluetoothStore((state) => (
      state.diagnostics.lastFailure
        ? describeBLEHandshakeProgressLabel(state.diagnostics.handshakeProgress)
        : ''
    ))
    const bleEnabled = useBluetoothStore((state) => state.config.enabled)
    const peerNearby = useBluetoothStore((state) => (
      state.nearbyContacts.some((contact) => contact.identityId === peerIdentityId)
    ))
    React.useEffect(() => {
      if (!diagnostics) return undefined
      const remaining = VISIBILITY_MS - (Date.now() - diagnostics.updatedAt)
      if (remaining <= 0) return undefined
      const timeout = setTimeout(
        () => setExpiryTick((value) => value + 1),
        remaining + 1,
      )
      return () => clearTimeout(timeout)
    }, [diagnostics])
    const messageVisible = Boolean(
      active
      && diagnostics
      && Date.now() - diagnostics.updatedAt <= VISIBILITY_MS,
    )
    const radioVisible = Boolean(
      bleEnabled
      && radioFailure
      && !peerNearby
      && (messageVisible || isBLESessionDiagnosticFailure(radioFailure)),
    )
    if (!messageVisible && !radioVisible) return null
    const failed = diagnostics?.stage === 'failed' || Boolean(radioVisible && radioFailure)
    const complete = diagnostics?.stage === 'receipt_received'
      || diagnostics?.stage === 'receipt_sent'
    const accent = failed ? colors.error : complete ? colors.success : colors.primary
    const Icon = failed ? AlertTriangle : complete ? CheckCircle2 : Bluetooth

    return (
      <View
        testID="bluetooth-message-diagnostics"
        className="mx-4 mt-2 rounded-xl border px-3 py-2"
        style={{
          borderColor: `${accent}55`,
          backgroundColor: `${accent}0D`,
        }}
      >
        <View className="flex-row items-center gap-2">
          <Icon size={14} color={accent} />
          <Text style={{ color: accent, fontSize: 12, fontWeight: '700' }}>
            {translate('Bluetooth message diagnostics')}
          </Text>
          {diagnostics ? (
            <Text className="text-text-muted text-xs" style={{ marginLeft: 'auto' }}>
              {translate(diagnostics.direction === 'outbound' ? 'Outbound' : 'Inbound')}
            </Text>
          ) : null}
        </View>
        {messageVisible && diagnostics ? (
          <Text className="text-text text-xs mt-1">
            {translate(STAGE_LABELS[diagnostics.stage])}
          </Text>
        ) : (
          <Text className="text-text text-xs mt-1">
            {translate(peerNearby
              ? 'Reconnecting the authenticated Bluetooth link.'
              : 'Nearby Bluetooth session is down.')}
          </Text>
        )}
        {messageVisible && diagnostics?.failure ? (
          <Text className="text-text-muted text-xs mt-0.5">
            {translate(FAILURE_LABELS[diagnostics.failure])}
          </Text>
        ) : null}
        {radioVisible && radioFailure ? (
          <>
            <Text className="text-text-muted text-xs mt-0.5">
              {translate(radioCause)}
            </Text>
            {radioStopStage ? (
              <Text className="text-text-muted text-xs mt-0.5">
                {translate(radioStopStage)}
                {' '}
                {translate(radioNoiseProgress)}
              </Text>
            ) : null}
          </>
        ) : null}
      </View>
    )
  },
)
