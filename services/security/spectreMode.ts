/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as bleMesh from '@/services/bluetooth'

import {
  applySpectreSecurityPreferences,
  readManagedSecurityPreferences,
  restoreManagedCachePreferences,
  restoreManagedSecurityPreferences,
} from './securityPreferences'
import { translateMessage as translate } from '@/lib/i18n/messages'
import { clearGroupChatStorageScope } from '@/services/groupChat/storage'
import {
  bootstrapBackendCloudSession,
  getCachedBackendAccessToken,
  invalidateAuthCaches,
  resetAuthCooldowns,
} from '@/services/backend/session'
import {
  clearPendingSpectreBlindActivationToken,
  closeSpectreAddress,
  getPendingSpectreBlindActivationToken,
  isSpectreWalletPendingRemoteActivation,
  issueSpectreBlindActivationToken,
  markSpectreWalletPendingRemoteActivation,
  redeemSpectreBlindActivationToken,
} from '@/services/backend/spectreAccess'
import { syncBundleServerAccessToken } from '@/services/quantumChat'
import { clearAsyncStorageScope } from '@/services/storage'
import { clearAddressBookSnapshot } from '@/services/storage/addressBookStorage'
import { clearEncryptedAvatarCache } from '@/services/media/avatarImageCache'
import { clearMediaCacheScope } from '@/services/media/localMediaCache'
import { startTor, stopTor, useTorStore } from '@/services/tor'
import {
  deriveSpectreWallet,
  generateMnemonic,
  importWalletFromMnemonic,
  MnemonicValidationError,
  validateMnemonic,
  type EXOWallet,
} from '@spectra/identity-vault'
import {
  cleanupChat,
  realignChatForActiveWallet,
  waitForChatQuiescence,
} from '@/services/chat/chatService'
import {
  clearSpectreDiagnosticsBuffers as clearDiagnosticsBuffers,
  initializeSpectreRuntime,
  setSpectreDiagnosticsRecordingEnabled as setDiagnosticsRecordingEnabled,
} from './spectreRuntime'
import {
  clearStrictPrivacyCaches,
  initializeCachePrivacySettings,
} from './dataProtection'
import { loadDuressPinState } from './duressPin'
import { useAuthStore } from '@/store/authStore'
import { useBluetoothStore } from '@/store/bluetoothStore'
import {
  type SpectreAccountMode,
  type SpectreActivationPhase,
  type SpectreSnapshot,
  readPersistedSpectreSnapshot,
  setPersistedSpectreBluetoothOverride,
  useSpectreStore,
  writePersistedSpectreSnapshot,
} from '@/store/spectreStore'
import { clearScopedChatPreferences } from '@/store/chatStore'
import { useWalletStore } from '@/store/walletStore'
import {
  deactivateNotificationRuntime,
  schedulePrivateTransportPushTokenCleanup,
} from '@/services/notifications/pushService'
import { suspendActiveWalletPushRegistration } from '@/services/notifications/registrationCoordinator'

const SPECTRE_LATENCY_LOG_PREFIX = '[Spectre]'
const SPECTRE_ENABLE_CANCELLED_ERROR = 'Spectre Mode activation was canceled'
const SPECTRE_RECOVERY_ERROR = 'Spectre Mode recovery could not restore the previous settings'

interface SpectreEnableTransition {
  cancelled: boolean
  started: boolean
  promise: Promise<void>
}

let activeEnableTransition: SpectreEnableTransition | null = null
let transitionQueue: Promise<void> = Promise.resolve()
let snapshotGeneration = 0

function serializeSpectreTransition<T>(operation: () => Promise<T>): Promise<T> {
  const result = transitionQueue.then(operation, operation)
  transitionQueue = result.then(() => {}, () => {})
  return result
}

function logSpectreLatency(event: string, details: Record<string, unknown>): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(SPECTRE_LATENCY_LOG_PREFIX, event, details)
  }
}

type SettledTaskResult<T> =
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: unknown }

function startSettledTask<T>(
  operation: () => Promise<T>,
): Promise<SettledTaskResult<T>> {
  return operation().then(
    (value) => ({ status: 'fulfilled', value }),
    (reason) => ({ status: 'rejected', reason }),
  )
}

async function unwrapSettledTask<T>(
  task: Promise<SettledTaskResult<T>>,
): Promise<T> {
  const result = await task
  if (result.status === 'rejected') {
    throw result.reason
  }

  return result.value
}

async function measureSpectrePhase<T>(
  mode: 'enable' | 'disable',
  phase: SpectreActivationPhase,
  flowStartedAt: number,
  operation: () => Promise<T>,
  options?: { shouldContinue?: () => boolean },
): Promise<T> {
  if (options?.shouldContinue && !options.shouldContinue()) {
    throw new Error(SPECTRE_ENABLE_CANCELLED_ERROR)
  }

  const phaseStartedAt = Date.now()
  useSpectreStore.getState().setActivationPhase(phase)

  try {
    const result = await operation()
    if (options?.shouldContinue && !options.shouldContinue()) {
      throw new Error(SPECTRE_ENABLE_CANCELLED_ERROR)
    }
    logSpectreLatency(`${mode}.${phase}`, {
      phaseMs: Date.now() - phaseStartedAt,
      totalMs: Date.now() - flowStartedAt,
    })
    return result
  } catch (error) {
    logSpectreLatency(`${mode}.${phase}.failed`, {
      phaseMs: Date.now() - phaseStartedAt,
      totalMs: Date.now() - flowStartedAt,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

async function measureSpectreBackgroundTask<T>(
  name: string,
  flowStartedAt: number,
  operation: () => Promise<T>,
): Promise<T> {
  const taskStartedAt = Date.now()

  try {
    const result = await operation()
    logSpectreLatency(`disable.background.${name}`, {
      taskMs: Date.now() - taskStartedAt,
      totalMs: Date.now() - flowStartedAt,
    })
    return result
  } catch (error) {
    logSpectreLatency(`disable.background.${name}.failed`, {
      taskMs: Date.now() - taskStartedAt,
      totalMs: Date.now() - flowStartedAt,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

function getWallets(): EXOWallet[] {
  return useWalletStore.getState().wallets
}

function resolveSpectreWallet(wallets: EXOWallet[] = getWallets()): EXOWallet | null {
  const spectreWalletId = useSpectreStore.getState().spectreWalletId
  if (spectreWalletId) {
    const byId = wallets.find((wallet) => wallet.id === spectreWalletId)
    if (byId) {
      return byId
    }
  }

  return wallets.find((wallet) => wallet.spectreMode) || null
}

function resolvePrimaryWallet(
  wallets: EXOWallet[] = getWallets(),
  preferredWalletId?: string | null,
): EXOWallet | null {
  if (preferredWalletId) {
    const preferred = wallets.find((wallet) => wallet.id === preferredWalletId && !wallet.spectreMode)
    if (preferred) {
      return preferred
    }
  }

  return wallets.find((wallet) => !wallet.spectreMode) || null
}

function resolveSnapshotPrimaryWallet(
  snapshot: SpectreSnapshot,
  wallets: EXOWallet[] = getWallets(),
): EXOWallet | null {
  if (snapshot.primaryWalletAddress) {
    const byAddress = wallets.find((wallet) => (
      !wallet.spectreMode && wallet.address === snapshot.primaryWalletAddress
    ))
    if (byAddress) {
      return byAddress
    }
  }

  if (snapshot.primaryWalletId) {
    return wallets.find((wallet) => (
      !wallet.spectreMode && wallet.id === snapshot.primaryWalletId
    )) ?? null
  }

  return null
}

function isRootWalletAddress(walletAddress: string, wallets: EXOWallet[] = getWallets()): boolean {
  return wallets.some((wallet) => !wallet.spectreMode && wallet.address === walletAddress)
}

function assertDistinctSpectreWallet(wallet: EXOWallet, wallets: EXOWallet[] = getWallets()): void {
  if (!wallet.spectreMode || isRootWalletAddress(wallet.address, wallets)) {
    throw new Error('A root wallet cannot also be used as a Spectre account')
  }
}

async function clearRootSpectreBlindActivationTokens(
  wallets: EXOWallet[],
  spectreWalletAddress: string,
): Promise<void> {
  await Promise.all(wallets
    .filter((wallet) => !wallet.spectreMode && wallet.address !== spectreWalletAddress)
    .map((wallet) =>
      clearPendingSpectreBlindActivationToken({
        walletAddress: wallet.address,
        isEphemeral: true,
      }),
    ))
}

async function clearExpendableSpectreWalletData(
  spectreWallet: EXOWallet,
  fallbackWalletId?: string | null,
): Promise<void> {
  await Promise.all([
    clearAsyncStorageScope(spectreWallet.address),
    clearGroupChatStorageScope(spectreWallet.address),
    clearScopedChatPreferences(spectreWallet.address),
    clearAddressBookSnapshot(spectreWallet.address),
    clearMediaCacheScope(spectreWallet.address),
    clearEncryptedAvatarCache(),
  ])

  await useWalletStore.getState().removeWallet(
    spectreWallet.id,
    fallbackWalletId ? { fallbackWalletId } : undefined,
  )
}

async function bestEffortCloseExpendableSpectreWallet(
  spectreWallet: EXOWallet,
): Promise<void> {
  try {
    const result = await closeSpectreAddress({
      bootstrapIfNeeded: true,
    })

    if (result.closed || result.reason === 'not_found') {
      return
    }
  } catch (error) {
    console.warn('[Spectre] Failed to close expendable Spectre wallet remotely:', error)
  }
}

function scheduleDeferredDisableCleanup(options: {
  flowStartedAt: number
  expendableSpectreWallet?: EXOWallet | null
}): void {
  void (async () => {
    if (options.expendableSpectreWallet) {
      await measureSpectreBackgroundTask('cleanup_expendable_wallet', options.flowStartedAt, () =>
        bestEffortCloseExpendableSpectreWallet(options.expendableSpectreWallet!),
      )
    }
  })().catch((error) => {
    console.warn('[Spectre] Deferred disable cleanup failed:', error)
  })
}

async function captureSpectreSnapshot(): Promise<SpectreSnapshot> {
  const capturedAt = Date.now()
  snapshotGeneration += 1
  const walletStore = useWalletStore.getState()
  const primaryWallet = resolvePrimaryWallet(walletStore.wallets, walletStore.activeWalletId)
  if (!primaryWallet) {
    throw new Error('Primary wallet not found')
  }
  const managedPreferences = await readManagedSecurityPreferences()

  return {
    version: 2,
    capturedAt,
    generation: `${capturedAt}:${snapshotGeneration}:${primaryWallet.id}`,
    primaryWalletId: primaryWallet.id,
    primaryWalletAddress: primaryWallet.address,
    torEnabled: useTorStore.getState().enabled,
    ...managedPreferences,
    bluetoothEnabled: useBluetoothStore.getState().config.enabled,
    bluetoothOverrideEnabled: null,
  }
}

async function applyManagedSpectreDefaults(): Promise<void> {
  const bluetoothStore = useBluetoothStore.getState()

  await Promise.all([
    applySpectreSecurityPreferences(),
    bluetoothStore.setEnabled(false),
  ])

  bleMesh.updateConfig({ enabled: false })
  await clearStrictPrivacyCaches()
  clearDiagnosticsBuffers()
  setDiagnosticsRecordingEnabled(false)
}

async function restoreSpectreCacheSettings(snapshot: SpectreSnapshot): Promise<void> {
  await restoreManagedCachePreferences(snapshot)
}

async function restoreSpectreRuntimeToggles(snapshot: SpectreSnapshot): Promise<void> {
  const bluetoothEnabled = snapshot.bluetoothOverrideEnabled ?? snapshot.bluetoothEnabled
  await useBluetoothStore.getState().setEnabled(bluetoothEnabled)
  bleMesh.updateConfig({ enabled: bluetoothEnabled })
  await restoreSpectreCacheSettings(snapshot)
}

async function restoreManagedSpectreSettings(snapshot: SpectreSnapshot): Promise<void> {
  await restoreManagedSecurityPreferences(snapshot)
  await restoreSpectreRuntimeToggles(snapshot)
  await initializeCachePrivacySettings()
  setDiagnosticsRecordingEnabled(true)
}

async function syncTorForSpectre(enabled: boolean): Promise<void> {
  const torStore = useTorStore.getState()
  if (torStore.enabled === enabled && (enabled ? torStore.status === 'connected' : torStore.status === 'disconnected')) {
    return
  }

  await torStore.setEnabled(enabled)

  if (enabled) {
    const success = await startTor()
    if (!success) {
      throw new Error(useTorStore.getState().errorMessage || 'Failed to connect to Tor')
    }
  } else {
    await stopTor()
  }

  resetAuthCooldowns()
  syncBundleServerAccessToken()
}

async function applyFailClosedSpectreRecovery(error: unknown): Promise<void> {
  const spectreState = useSpectreStore.getState()
  if (spectreState.activationFlow) {
    spectreState.setActivationPhase('rollback')
  } else {
    spectreState.startActivation('disable', 'rollback')
  }
  invalidateAuthCaches()
  await useAuthStore.getState().clearCloudSession().catch(() => {})
  await spectreState.setEnabled(true).catch(() => {})
  await applyManagedSpectreDefaults().catch(() => {})
  await syncTorForSpectre(true).catch(() => {})
  useSpectreStore.getState().failActivation(
    error instanceof Error ? error.message : SPECTRE_RECOVERY_ERROR,
  )
}

async function restoreSpectreSnapshot(options: {
  snapshot: SpectreSnapshot
  spectreWallet?: EXOWallet | null
  removeExpendableWallet?: boolean
}): Promise<void> {
  const walletStore = useWalletStore.getState()
  const primaryWallet = resolveSnapshotPrimaryWallet(options.snapshot, walletStore.wallets)
  if (!primaryWallet) {
    throw new Error('The primary wallet saved before Spectre Mode is unavailable')
  }

  await activateWallet(primaryWallet, { bootstrapCloudSession: false })
  await useSpectreStore.getState().setEnabled(false)
  await restoreManagedSpectreSettings(options.snapshot)
  await syncTorForSpectre(options.snapshot.torEnabled)

  if (options.removeExpendableWallet && options.spectreWallet) {
    await clearExpendableSpectreWalletData(options.spectreWallet, primaryWallet.id)
    await useSpectreStore.getState().setSpectreWalletId(null)
    await useSpectreStore.getState().setSpectreAccountMode(null)
  }

  await writePersistedSpectreSnapshot(null)
}

async function clearSpectrePushRegistrations(
  wallets: EXOWallet[],
  flowStartedAt: number,
  accessToken: string | null,
): Promise<void> {
  const walletAddresses = wallets
    .filter((wallet) => wallet.spectreMode !== true)
    .map((wallet) => wallet.address)

  if (walletAddresses.length === 0) {
    return
  }
  if (!accessToken) {
    throw new Error('Previous account push cleanup requires verified backend access')
  }

  logSpectreLatency('enable.push_cleanup.started', {
    hasAccessToken: Boolean(accessToken),
    totalMs: Date.now() - flowStartedAt,
    walletCount: walletAddresses.length,
  })

  await schedulePrivateTransportPushTokenCleanup(walletAddresses, { accessToken })
  await deactivateNotificationRuntime()

  logSpectreLatency('enable.push_cleanup.completed', {
    hasAccessToken: true,
    totalMs: Date.now() - flowStartedAt,
    walletCount: walletAddresses.length,
  })
}

async function activateWallet(
  wallet: EXOWallet,
  options?: { bootstrapCloudSession?: boolean },
): Promise<void> {
  invalidateAuthCaches()
  cleanupChat()
  await waitForChatQuiescence()
  await useWalletStore.getState().switchWallet(wallet.id)
  useAuthStore.getState().setAuthenticated(wallet.address, wallet.publicKey)
  await useAuthStore.getState().clearCloudSession()

  // Skip cloud bootstrap when transitions should stay local.
  if (options?.bootstrapCloudSession === false) {
    void realignChatForActiveWallet().catch((error) => {
      console.warn('[Spectre] Failed to realign chat after wallet activation:', error)
    })
    return
  }

  await bootstrapBackendCloudSession().catch(() => false)
  void realignChatForActiveWallet().catch((error) => {
    console.warn('[Spectre] Failed to realign chat after wallet activation:', error)
  })
}

async function verifyRemoteSpectreActivationContext(
  spectreWallet: EXOWallet,
  activationToken: Awaited<ReturnType<typeof issueSpectreBlindActivationToken>>,
): Promise<void> {
  const activeWallet = useWalletStore.getState().wallet
  if (activeWallet?.address !== spectreWallet.address || activationToken.walletAddress !== spectreWallet.address) {
    throw new Error('Prepare the expendable Spectre account before activation')
  }

  const verified = await bootstrapBackendCloudSession()
  const accessToken = getCachedBackendAccessToken()
  if (!verified || !accessToken || useWalletStore.getState().wallet?.address !== spectreWallet.address) {
    throw new Error('Verify the expendable Spectre account before activation')
  }
}

export { initializeSpectreRuntime }

export async function getSpectreSetupRequirements(): Promise<{
  needsMnemonic: boolean
  needsDuressPin: boolean
  hasExistingWallet: boolean
  existingAccountMode: SpectreAccountMode | null
}> {
  const spectreWallet = resolveSpectreWallet()
  const duressState = await loadDuressPinState()
  const spectreAccountMode = useSpectreStore.getState().spectreAccountMode

  return {
    needsMnemonic: !spectreWallet,
    needsDuressPin: !duressState.hasDuressPin,
    hasExistingWallet: Boolean(spectreWallet),
    existingAccountMode: spectreAccountMode,
  }
}

export async function ensureSpectreWalletFromMnemonic(mnemonic: string): Promise<EXOWallet> {
  const validation = validateMnemonic(mnemonic)
  if (!validation.valid) {
    throw new MnemonicValidationError(validation.code, validation.params)
  }

  const walletStore = useWalletStore.getState()
  if (!walletStore.isVaultUnlocked) {
    throw new Error('Unlock the vault before configuring Spectre Mode')
  }

  const existingSpectreWallet = resolveSpectreWallet(walletStore.wallets)
  if (existingSpectreWallet) {
    await useSpectreStore.getState().setSpectreWalletId(existingSpectreWallet.id)
    if (!useSpectreStore.getState().spectreAccountMode) {
      await useSpectreStore.getState().setSpectreAccountMode('mnemonic')
    }
    return existingSpectreWallet
  }

  const primaryWallet = resolvePrimaryWallet(walletStore.wallets, walletStore.activeWalletId)
  if (!primaryWallet) {
    throw new Error('Primary wallet not found')
  }

  const importedPrimaryWallet = await importWalletFromMnemonic(mnemonic, primaryWallet.displayName)
  if (importedPrimaryWallet.address !== primaryWallet.address) {
    throw new Error('Recovery phrase does not match this device wallet')
  }

  const spectreWallet = await deriveSpectreWallet(mnemonic)
  const addedWallet = await walletStore.addWallet(spectreWallet)
  await useSpectreStore.getState().setSpectreWalletId(addedWallet.id)
  await useSpectreStore.getState().setSpectreAccountMode('mnemonic')
  return addedWallet
}

export async function configureBundledSpectreWallet(): Promise<EXOWallet> {
  const walletStore = useWalletStore.getState()
  if (!walletStore.isVaultUnlocked) {
    throw new Error('Unlock the vault before configuring Spectre Mode')
  }

  const spectreWallet = resolveSpectreWallet(walletStore.wallets)
  if (!spectreWallet) {
    throw new Error('Spectre wallet is not configured yet')
  }

  await useSpectreStore.getState().setSpectreWalletId(spectreWallet.id)
  if (!useSpectreStore.getState().spectreAccountMode) {
    await useSpectreStore.getState().setSpectreAccountMode('mnemonic')
  }
  return spectreWallet
}

async function createGeneratedSpectreWallet(options?: {
  allowExistingSpectreWallet?: boolean
}): Promise<{ wallet: EXOWallet; mnemonic: string }> {
  const walletStore = useWalletStore.getState()
  if (!walletStore.isVaultUnlocked) {
    throw new Error('Unlock the vault before configuring Spectre Mode')
  }

  const existingSpectreWallet = resolveSpectreWallet(walletStore.wallets)
  if (existingSpectreWallet && !options?.allowExistingSpectreWallet) {
    throw new Error('A Spectre wallet already exists on this device')
  }

  const mnemonic = generateMnemonic()
  const spectreWallet = await deriveSpectreWallet(mnemonic)
  assertDistinctSpectreWallet(spectreWallet, walletStore.wallets)
  return {
    wallet: spectreWallet,
    mnemonic,
  }
}

export async function createPersistentGeneratedSpectreWallet(): Promise<{
  wallet: EXOWallet
  mnemonic: string
}> {
  return createGeneratedSpectreWallet()
}

export async function createExpendableSpectreWallet(): Promise<{
  wallet: EXOWallet
  mnemonic: string
}> {
  return createGeneratedSpectreWallet({ allowExistingSpectreWallet: true })
}

export async function preIssueExpendableSpectreActivationToken(wallet: EXOWallet): Promise<void> {
  const walletStore = useWalletStore.getState()
  const wallets = walletStore.wallets
  const rootWallet = walletStore.wallet && !walletStore.wallet.spectreMode
    ? walletStore.wallet
    : wallets.find((storedWallet) => !storedWallet.spectreMode && storedWallet.address !== wallet.address)
  assertDistinctSpectreWallet(wallet)
  if (!rootWallet) {
    throw new Error('An active root wallet is required to prepare Spectre activation')
  }
  await clearRootSpectreBlindActivationTokens(wallets, wallet.address)

  await markSpectreWalletPendingRemoteActivation(wallet.address)
  await issueSpectreBlindActivationToken(wallet.address, {
    bootstrapIfNeeded: true,
    rootWalletAddress: rootWallet.address,
  })
}

export async function clearPreparedExpendableSpectreActivation(walletAddress: string): Promise<void> {
  await clearPendingSpectreBlindActivationToken({
    walletAddress,
    isEphemeral: true,
  })
}

export async function registerPreparedSpectreWallet(
  wallet: EXOWallet,
  mode: SpectreAccountMode,
): Promise<EXOWallet> {
  const walletStore = useWalletStore.getState()
  if (!walletStore.isVaultUnlocked) {
    throw new Error('Unlock the vault before configuring Spectre Mode')
  }

  const existingSpectreWallet = resolveSpectreWallet(walletStore.wallets)
  if (
    existingSpectreWallet
    && existingSpectreWallet.address !== wallet.address
    && mode !== 'expendable'
  ) {
    throw new Error('A Spectre wallet already exists on this device')
  }

  const addedWallet = await walletStore.addWallet(wallet)
  if (mode === 'expendable') {
    assertDistinctSpectreWallet(addedWallet, walletStore.wallets)
  }
  await useSpectreStore.getState().setSpectreWalletId(addedWallet.id)
  await useSpectreStore.getState().setSpectreAccountMode(mode)
  if (mode === 'expendable') {
    await markSpectreWalletPendingRemoteActivation(addedWallet.address)
  }
  return addedWallet
}

async function prepareRemoteSpectreActivationIfNeeded(
  spectreWallet: EXOWallet,
  isEphemeral: boolean,
): Promise<{
  needsRemoteActivation: boolean
  token: Awaited<ReturnType<typeof issueSpectreBlindActivationToken>> | null
}> {
  if (!isEphemeral) {
    return {
      needsRemoteActivation: false,
      token: null,
    }
  }

  const needsRemoteActivation = await isSpectreWalletPendingRemoteActivation(spectreWallet.address)
  if (!needsRemoteActivation) {
    const pendingToken = await getPendingSpectreBlindActivationToken({
      walletAddress: spectreWallet.address,
      isEphemeral,
    })
    if (pendingToken?.walletAddress === spectreWallet.address) {
      await clearPendingSpectreBlindActivationToken({
        walletAddress: spectreWallet.address,
        purpose: pendingToken.purpose,
        isEphemeral,
      })
    }

    return {
      needsRemoteActivation: false,
      token: null,
    }
  }

  const pendingToken = await getPendingSpectreBlindActivationToken({
    walletAddress: spectreWallet.address,
    isEphemeral,
  })
  if (
    pendingToken
    && pendingToken.walletAddress === spectreWallet.address
    && pendingToken.isEphemeral === isEphemeral
  ) {
    return {
      needsRemoteActivation: true,
      token: pendingToken,
    }
  }

  throw new Error('Prepare an expendable Spectre activation token before enabling Spectre Mode')
}

async function performEnableSpectreMode(transition: SpectreEnableTransition): Promise<void> {
  transition.started = true
  if (transition.cancelled) {
    return
  }

  const flowStartedAt = Date.now()
  const shouldContinue = () => !transition.cancelled
  const spectreStore = useSpectreStore.getState()
  const walletStore = useWalletStore.getState()
  if (spectreStore.enabled) {
    return
  }
  if (!walletStore.isVaultUnlocked) {
    throw new Error('Unlock the vault before enabling Spectre Mode')
  }

  const spectreWallet = resolveSpectreWallet(walletStore.wallets)
  if (!spectreWallet) {
    throw new Error('Spectre wallet is not configured yet')
  }

  const duressState = await loadDuressPinState()
  if (!duressState.hasDuressPin) {
    throw new Error('Configure a duress PIN before enabling Spectre Mode')
  }

  const previousWallet = resolvePrimaryWallet(walletStore.wallets, walletStore.activeWalletId) || walletStore.wallet
  if (!previousWallet || previousWallet.spectreMode) {
    throw new Error('Primary wallet not found')
  }

  logSpectreLatency('enable.started', {
    walletCount: walletStore.wallets.length,
    spectreAccountMode: spectreStore.spectreAccountMode,
  })
  if (spectreStore.activationFlow === 'enable' && spectreStore.isApplying) {
    spectreStore.setActivationPhase('prepare_account')
  } else {
    spectreStore.startActivation('enable', 'prepare_account')
  }

  const pushRegistrationDrain = suspendActiveWalletPushRegistration()
  const pushCleanupWallets = walletStore.wallets.filter((wallet) => wallet.spectreMode !== true)
  let rollbackSnapshot: SpectreSnapshot | null = null
  let localPrivacyTask: Promise<SettledTaskResult<void>> | null = null
  let remoteActivationToken: Awaited<ReturnType<typeof issueSpectreBlindActivationToken>> | null = null
  let pushCleanupStarted = false
  let pushCleanupConfirmed = false

  try {
    rollbackSnapshot = await measureSpectrePhase('enable', 'capture_snapshot', flowStartedAt, () =>
      captureSpectreSnapshot(),
      { shouldContinue },
    )
    await measureSpectrePhase('enable', 'persist_snapshot', flowStartedAt, () =>
      writePersistedSpectreSnapshot(rollbackSnapshot!),
      { shouldContinue },
    )
    localPrivacyTask = startSettledTask(() => applyManagedSpectreDefaults())
    await measureSpectrePhase('enable', 'enable_tor', flowStartedAt, () =>
      syncTorForSpectre(true),
      { shouldContinue },
    )
    await measureSpectrePhase('enable', 'apply_local_privacy', flowStartedAt, async () => {
      if (!localPrivacyTask) {
        return
      }

      await unwrapSettledTask(localPrivacyTask)
    }, { shouldContinue })
    let pushCleanupAccessToken = getCachedBackendAccessToken()
    if (!pushCleanupAccessToken) {
      const verified = await measureSpectrePhase('enable', 'verify_cloud', flowStartedAt, () =>
        bootstrapBackendCloudSession(),
        { shouldContinue },
      )
      pushCleanupAccessToken = verified ? getCachedBackendAccessToken() : null
    }
    await pushRegistrationDrain
    pushCleanupStarted = true
    await measureSpectrePhase('enable', 'verify_cloud', flowStartedAt, () =>
      clearSpectrePushRegistrations(
        pushCleanupWallets,
        flowStartedAt,
        pushCleanupAccessToken,
      ),
      { shouldContinue },
    )
    pushCleanupConfirmed = true
    const remoteActivation = await measureSpectrePhase('enable', 'verify_cloud', flowStartedAt, () =>
      prepareRemoteSpectreActivationIfNeeded(
        spectreWallet,
        spectreStore.spectreAccountMode === 'expendable',
      ),
      { shouldContinue },
    )
    remoteActivationToken = remoteActivation.token
    if (remoteActivation.needsRemoteActivation) {
      const activationToken = remoteActivation.token
      if (!activationToken) {
        throw new Error(translate('Spectre activation token is not available', { ns: 'settings' }))
      }
    }

    await measureSpectrePhase('enable', 'activate_wallet', flowStartedAt, () =>
      activateWallet(spectreWallet, { bootstrapCloudSession: false }),
      { shouldContinue },
    )
    if (remoteActivation.needsRemoteActivation) {
      const activationToken = remoteActivation.token
      if (!activationToken) {
        throw new Error(translate('Spectre activation token is not available', { ns: 'settings' }))
      }

      await measureSpectrePhase('enable', 'verify_cloud', flowStartedAt, () =>
        verifyRemoteSpectreActivationContext(spectreWallet, activationToken),
        { shouldContinue },
      )

      await measureSpectrePhase('enable', 'verify_cloud', flowStartedAt, () =>
        redeemSpectreBlindActivationToken(activationToken, {
          bootstrapIfNeeded: false,
        }),
        { shouldContinue },
      )
    }
    await measureSpectrePhase('enable', 'finalize_state', flowStartedAt, async () => {
      await useSpectreStore.getState().setSpectreWalletId(spectreWallet.id)
      if (!useSpectreStore.getState().spectreAccountMode) {
        await useSpectreStore.getState().setSpectreAccountMode('mnemonic')
      }
      await useSpectreStore.getState().setEnabled(true)
    }, { shouldContinue })
    logSpectreLatency('enable.completed', {
      totalMs: Date.now() - flowStartedAt,
      spectreWalletId: spectreWallet.id,
    })
  } catch (error) {
    useSpectreStore.getState().setActivationPhase('rollback')
    if (localPrivacyTask) {
      await localPrivacyTask
    }
    if (pushCleanupStarted && !pushCleanupConfirmed) {
      await applyFailClosedSpectreRecovery(error)
      logSpectreLatency('enable.failed', {
        totalMs: Date.now() - flowStartedAt,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
    if (remoteActivationToken) {
      await clearPendingSpectreBlindActivationToken({
        walletAddress: remoteActivationToken.walletAddress,
        purpose: remoteActivationToken.purpose,
        isEphemeral: remoteActivationToken.isEphemeral,
      }).catch(() => {})
    }

    let rollbackError: unknown = null
    if (rollbackSnapshot) {
      try {
        const removeExpendableWallet = spectreStore.spectreAccountMode === 'expendable'
        await restoreSpectreSnapshot({
          snapshot: rollbackSnapshot,
          spectreWallet,
          removeExpendableWallet,
        })
        if (removeExpendableWallet) {
          await bestEffortCloseExpendableSpectreWallet(spectreWallet)
        }
      } catch (restoreError) {
        rollbackError = restoreError
        await applyFailClosedSpectreRecovery(restoreError)
      }
    }

    logSpectreLatency('enable.failed', {
      totalMs: Date.now() - flowStartedAt,
      error: error instanceof Error ? error.message : String(error),
    })
    if (!rollbackError) {
      useSpectreStore.getState().failActivation(
        error instanceof Error ? error.message : 'Failed to enable Spectre Mode',
      )
    }
    throw error
  }
}

export function enableSpectreMode(): Promise<void> {
  if (activeEnableTransition) {
    return activeEnableTransition.promise
  }

  const transition = {
    cancelled: false,
    started: false,
    promise: Promise.resolve(),
  } as SpectreEnableTransition
  const promise = serializeSpectreTransition(() => performEnableSpectreMode(transition))
  transition.promise = promise
  activeEnableTransition = transition
  void promise.then(
    () => {
      if (activeEnableTransition === transition) activeEnableTransition = null
    },
    () => {
      if (activeEnableTransition === transition) activeEnableTransition = null
    },
  )
  return promise
}

export async function cancelSpectreActivation(): Promise<void> {
  const transition = activeEnableTransition
  if (!transition) {
    return
  }

  transition.cancelled = true
  if (transition.started && useSpectreStore.getState().isApplying) {
    useSpectreStore.getState().setActivationPhase('rollback')
  }

  try {
    await transition.promise
  } catch {
    // The enable transition owns rollback and cleanup.
  }
}

async function performDisableSpectreMode(options?: {
  reason?: 'manual' | 'expired'
}): Promise<void> {
  const flowStartedAt = Date.now()
  const spectreStore = useSpectreStore.getState()
  const walletStore = useWalletStore.getState()
  if (!walletStore.isVaultUnlocked) {
    throw new Error('Unlock the vault before disabling Spectre Mode')
  }

  logSpectreLatency('disable.started', {
    spectreAccountMode: spectreStore.spectreAccountMode,
  })
  spectreStore.startActivation('disable', 'read_snapshot')

  const spectreWallet = resolveSpectreWallet(walletStore.wallets)
  const removeExpendableWallet = spectreStore.spectreAccountMode === 'expendable'
  let snapshot: SpectreSnapshot | null = null

  try {
    snapshot = await measureSpectrePhase('disable', 'read_snapshot', flowStartedAt, () =>
      readPersistedSpectreSnapshot(),
    )
    if (!snapshot) {
      throw new Error('Spectre settings snapshot is unavailable')
    }
    const persistedSnapshot = snapshot

    await measureSpectrePhase('disable', 'restore_settings', flowStartedAt, () =>
      restoreSpectreSnapshot({
        snapshot: persistedSnapshot,
        spectreWallet,
        removeExpendableWallet,
      }),
    )
    logSpectreLatency('disable.completed', {
      totalMs: Date.now() - flowStartedAt,
      resetSpectreWallet: removeExpendableWallet,
    })
    useSpectreStore.getState().completeActivation()
    scheduleDeferredDisableCleanup({
      flowStartedAt,
      expendableSpectreWallet:
        removeExpendableWallet ? spectreWallet : null,
    })
  } catch (error) {
    logSpectreLatency('disable.failed', {
      totalMs: Date.now() - flowStartedAt,
      error: error instanceof Error ? error.message : String(error),
    })
    await applyFailClosedSpectreRecovery(error)
    if (!(error instanceof Error)) {
      useSpectreStore.getState().failActivation(
        options?.reason === 'expired'
          ? translate('Failed to disable an expired Spectre session', { ns: 'settings' })
          : translate('Failed to disable Spectre Mode', { ns: 'settings' }),
      )
    }
    throw error
  }
}

export function disableSpectreMode(options?: {
  reason?: 'manual' | 'expired'
}): Promise<void> {
  return serializeSpectreTransition(() => performDisableSpectreMode(options))
}

export function setSpectreBluetoothExitOverride(enabled: boolean): Promise<void> {
  return serializeSpectreTransition(async () => {
    const spectreState = useSpectreStore.getState()
    if (!spectreState.enabled || spectreState.isApplying) {
      throw new Error('Spectre Mode settings are transitioning')
    }
    await setPersistedSpectreBluetoothOverride(enabled)
  })
}

async function performSpectreStartupReconciliation(): Promise<void> {
  const spectreState = useSpectreStore.getState()
  let snapshot: SpectreSnapshot | null
  try {
    snapshot = await readPersistedSpectreSnapshot()
  } catch (error) {
    await applyFailClosedSpectreRecovery(error)
    throw error
  }

  if (!snapshot && !spectreState.enabled) {
    return
  }

  if (!snapshot) {
    const error = new Error('Spectre Mode recovery snapshot is missing or invalid')
    await applyFailClosedSpectreRecovery(error)
    return
  }

  if (!spectreState.enabled) {
    spectreState.startActivation('disable', 'rollback')
    try {
      const spectreWallet = resolveSpectreWallet()
      const removeExpendableWallet = spectreState.spectreAccountMode === 'expendable'
      await restoreSpectreSnapshot({
        snapshot,
        spectreWallet,
        removeExpendableWallet,
      })
      if (removeExpendableWallet && spectreWallet) {
        await bestEffortCloseExpendableSpectreWallet(spectreWallet)
      }
      useSpectreStore.getState().completeActivation()
    } catch (error) {
      await applyFailClosedSpectreRecovery(error)
      throw error
    }
    return
  }

  try {
    const spectreWallet = resolveSpectreWallet()
    if (!spectreWallet) {
      spectreState.startActivation('disable', 'rollback')
      await restoreSpectreSnapshot({ snapshot })
      useSpectreStore.getState().completeActivation()
      return
    }

    if (useWalletStore.getState().activeWalletId !== spectreWallet.id) {
      await activateWallet(spectreWallet, { bootstrapCloudSession: false })
    }

    await applyManagedSpectreDefaults()
    if (snapshot.bluetoothOverrideEnabled !== null) {
      await useBluetoothStore.getState().setEnabled(snapshot.bluetoothOverrideEnabled)
      bleMesh.updateConfig({ enabled: snapshot.bluetoothOverrideEnabled })
    }
    await syncTorForSpectre(true)
  } catch (error) {
    await applyFailClosedSpectreRecovery(error)
    throw error
  }
}

export function reconcileSpectreModeOnStartup(): Promise<void> {
  return serializeSpectreTransition(performSpectreStartupReconciliation)
}

export async function forceDisableExpiredSpectreMode(): Promise<void> {
  if (!useSpectreStore.getState().enabled) {
    return
  }

  try {
    await disableSpectreMode({ reason: 'expired' })
  } catch (error) {
    console.warn('[Spectre] Failed to disable expired Spectre Mode cleanly:', error)
  }
}
