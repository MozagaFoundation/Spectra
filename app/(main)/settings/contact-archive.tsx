/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as Haptics from 'expo-haptics'
import * as Sharing from 'expo-sharing'
import { useRouter } from 'expo-router'
import { ChevronLeft, Download, Shield, Upload } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button, Card } from '@/components/ui'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import {
  createContactArchive,
  deleteContactArchiveFile,
  restoreContactArchive,
  writeContactArchiveFile,
  type ContactArchiveSummary,
} from '@/services/backup'
import {
  hydrateLocalContactProjection,
  repairLocalContactProjection,
} from '@/services/quantumChat'
import { useSpectreStore } from '@/store/spectreStore'
import { useWalletStore } from '@/store/walletStore'

function summaryText(summary: ContactArchiveSummary): string {
  return translate('Contacts: {{contacts}}', {
    contacts: String(summary.contacts),
  })
}

export default function ContactArchiveScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const wallet = useWalletStore((state) => state.wallet)
  const isVaultUnlocked = useWalletStore((state) => state.isVaultUnlocked)
  const spectreEnabled = useSpectreStore((state) => state.enabled)
  const [passphrase, setPassphrase] = useState('')
  const [working, setWorking] = useState(false)

  const disabledReason = useMemo(() => {
    if (spectreEnabled) return 'Contact archives are unavailable while Spectre Mode is active.'
    if (!wallet) return 'No active wallet is available.'
    if (!isVaultUnlocked) return 'Unlock your vault before managing a contact archive.'
    if (wallet.spectreMode) return 'Contact archives are unavailable for Spectre accounts.'
    return null
  }, [isVaultUnlocked, spectreEnabled, wallet])

  const requirePassphrase = (): string | null => {
    const normalized = passphrase.trim()
    if (normalized.length < 16) {
      Alert.alert(
        translate('Archive Passphrase Required'),
        translate('Use a unique passphrase with at least 16 characters including letters, numbers, and symbols. Spectra cannot recover it.'),
      )
      return null
    }
    return normalized
  }

  const handleExport = async () => {
    const archivePassphrase = requirePassphrase()
    if (!archivePassphrase) return

    try {
      setWorking(true)
      const { capsuleJson, summary } = await createContactArchive(archivePassphrase)
      const uri = await writeContactArchiveFile(capsuleJson)
      try {
        if (!await Sharing.isAvailableAsync()) {
          throw new Error('File sharing is unavailable on this device')
        }
        await Sharing.shareAsync(uri, {
          mimeType: 'application/octet-stream',
          dialogTitle: translate('Save encrypted contact archive'),
          UTI: 'public.data',
        })
      } finally {
        await deleteContactArchiveFile(uri).catch(() => undefined)
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert(translate('Archive Exported'), summaryText(summary))
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert(translate('Export Failed'), getErrorDisplayMessage(error))
    } finally {
      setPassphrase('')
      setWorking(false)
    }
  }

  const rehydrateImportedContacts = async () => {
    const hydration = await hydrateLocalContactProjection(wallet?.address)
    if (hydration) {
      void repairLocalContactProjection(hydration).catch(() => undefined)
    }
  }

  const importSelectedArchive = async (uri: string, archivePassphrase: string) => {
    try {
      setWorking(true)
      const summary = await restoreContactArchive(uri, archivePassphrase)
      await rehydrateImportedContacts()
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      Alert.alert(translate('Import Complete'), summaryText(summary))
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert(translate('Import Failed'), getErrorDisplayMessage(error))
    } finally {
      await deleteContactArchiveFile(uri).catch(() => undefined)
      setPassphrase('')
      setWorking(false)
    }
  }

  const handleImport = async () => {
    const archivePassphrase = requirePassphrase()
    if (!archivePassphrase) return

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      })
      if (result.canceled || !result.assets[0]?.uri) {
        return
      }

      Alert.alert(
        translate('Import contact archive?'),
        translate('Imported contacts are merged with contacts already on this device. Chats, messages, sessions, group keys, and media are never imported.'),
        [
          {
            text: translate('Cancel'),
            style: 'cancel',
            onPress: () => {
              void deleteContactArchiveFile(result.assets[0].uri).catch(() => undefined)
            },
          },
          {
            text: translate('Import'),
            onPress: () => {
              void importSelectedArchive(result.assets[0].uri, archivePassphrase)
            },
          },
        ],
      )
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert(translate('Import Failed'), getErrorDisplayMessage(error))
    }
  }

  return (
    <View className="flex-1 bg-background" style={{ backgroundColor: colors.background }}>
      <View className="flex-row items-center px-4 py-3" style={{ paddingTop: insets.top }}>
        <Pressable onPress={() => router.back()} className="p-2 -ml-2">
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text className="flex-1 text-xl font-bold text-text text-center mr-8">
          {translate('Contact Archive')}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}
      >
        <View className="items-center mb-6">
          <View
            className="w-20 h-20 rounded-2xl items-center justify-center mb-4"
            style={{ backgroundColor: colors.primary + '26' }}
          >
            <Download size={40} color={colors.primary} />
          </View>
          <Text className="text-2xl font-bold text-text text-center">
            {translate('Encrypted contact archive')}
          </Text>
          <Text className="text-text-secondary text-center mt-2">
            {translate('Export an encrypted file you control, then import it later to preserve saved contacts.')}
          </Text>
        </View>

        {disabledReason ? (
          <Card className="p-4 mb-4 border border-warning">
            <Text className="text-text font-semibold mb-1">{translate('Archives unavailable')}</Text>
            <Text className="text-text-secondary">{translate(disabledReason)}</Text>
          </Card>
        ) : null}

        <Card className="p-4 mb-4">
          <View className="flex-row gap-3">
            <Shield size={20} color={colors.warning} />
            <Text className="flex-1 text-text-secondary text-sm leading-5">
              {translate('The archive is encrypted on this device before sharing. It never uploads to Spectra. Keep the file and passphrase separately; Spectra cannot recover either one.')}
            </Text>
          </View>
        </Card>

        <Card className="p-4 mb-4">
          <Text className="text-text font-semibold mb-2">{translate('Archive Passphrase')}</Text>
          <TextInput
            value={passphrase}
            onChangeText={setPassphrase}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={translate('At least 16 characters')}
            placeholderTextColor={colors.textMuted}
            className="border border-border rounded-xl px-4 py-3 text-text mb-3"
          />
          <View className="gap-3">
            <Button
              fullWidth
              loading={working}
              disabled={Boolean(disabledReason) || working}
              icon={<Upload size={18} color={colors.textOnPrimary} />}
              onPress={handleExport}
            >
              {translate('Export file')}
            </Button>
            <Button
              fullWidth
              variant="secondary"
              disabled={Boolean(disabledReason) || working}
              icon={<Download size={18} color={colors.text} />}
              onPress={() => void handleImport()}
            >
              {translate('Import file')}
            </Button>
          </View>
        </Card>

        <Text className="text-text-secondary text-sm leading-5">
          {translate('Only saved contacts and contact labels are included. Existing contacts are kept, and restored contacts become available immediately after import.')}
        </Text>
      </ScrollView>
    </View>
  )
}
