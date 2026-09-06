/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { loadExpoAppConfig } from './expoAppConfig.mjs'

const rootDir = resolve(import.meta.dirname, '..')
const app = loadExpoAppConfig({ rootDir })
const productionBackendUrl =
  'https://zaobpddfzrwbijfzohxs.supabase.co/functions/v1/spectra-api'

function read(path) {
  return readFileSync(resolve(rootDir, path), 'utf8')
}

function readPlist(path) {
  return JSON.parse(execFileSync(
    'plutil',
    ['-convert', 'json', '-o', '-', resolve(rootDir, path)],
    { encoding: 'utf8' },
  ))
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message)
}

const info = readPlist('ios/Spectra/Info.plist')
const entitlements = readPlist('ios/Spectra/Spectra.entitlements')
const privacy = readPlist('ios/Spectra/PrivacyInfo.xcprivacy')
const project = read('ios/Spectra.xcodeproj/project.pbxproj')
const gradle = read('android/app/build.gradle')
const manifest = read('android/app/src/main/AndroidManifest.xml')
const backupRules = read('android/app/src/main/res/xml/secure_store_backup_rules.xml')
const extractionRules = read('android/app/src/main/res/xml/secure_store_data_extraction_rules.xml')
const networkSecurity = read('android/app/src/main/res/xml/network_security_config.xml')
const packageJson = JSON.parse(read('package.json'))
const appConstants = read('lib/constants.ts')
const pinningPlugin = read('plugins/withCertificatePinning.js')
const bridge = read('ios/Spectra/Spectra-Bridging-Header.h')
const shareExtension = read('ios/SpectraShareExtension/ShareViewController.swift')
const mediaIngress = read('services/media/mediaIngress.ts')
const shareImport = read('services/media/shareImport.ts')
const nativeIntent = read('app/+native-intent.tsx')
const mobileLogger = read('services/logging/mobileLogger.ts')
const indexEntry = read('index.js')
const callNotificationTask = read('services/notifications/callNotificationTask.ts')
const registrationCoordinator = read('services/notifications/registrationCoordinator.ts')

const iosBundleIds = [...project.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)]
  .map((match) => match[1])
const iosVersions = [...project.matchAll(/MARKETING_VERSION = ([^;]+);/g)]
  .map((match) => match[1])
const androidApplicationId = gradle.match(/applicationId\s+['"]([^'"]+)['"]/)?.[1]
const androidVersion = gradle.match(/versionName\s+"([^"]+)"/)?.[1]
const fallbackAppVersion = appConstants.match(/export const APP_VERSION = '([^']+)'/)?.[1]

requireCondition(app.ios?.bundleIdentifier === 'org.spectramozaga.exo', 'Unexpected iOS bundle identifier')
requireCondition(iosBundleIds.includes(app.ios.bundleIdentifier), 'Xcode main bundle identifier missing')
requireCondition(
  iosBundleIds.every((value) =>
    value === app.ios.bundleIdentifier || value.startsWith(`${app.ios.bundleIdentifier}.`)
  ),
  'Xcode bundle identifier drift',
)
requireCondition(app.android?.package === 'com.mozaga.exo', 'Unexpected Android application identifier')
requireCondition(androidApplicationId === app.android.package, 'Gradle application identifier drift')
requireCondition(androidVersion === app.version, 'Android version does not match Expo version')
requireCondition(iosVersions.every((value) => value === app.version), 'iOS version does not match Expo version')
requireCondition(packageJson.version === app.version, 'Package version does not match Expo version')
requireCondition(fallbackAppVersion === app.version, 'Runtime fallback version does not match Expo version')

const backgroundModes = info.UIBackgroundModes ?? []
requireCondition(Array.isArray(backgroundModes) && !backgroundModes.includes('voip'), 'VoIP background mode must remain disabled')
requireCondition(!packageJson.dependencies?.['react-native-voip-push-notification'], 'Unused VoIP push dependency is installed')
requireCondition(!bridge.includes('RNVoipPushNotificationManager'), 'Unused VoIP bridge remains enabled')
requireCondition(
  indexEntry.includes('Promise.resolve(registerCallNotificationTask())')
    && indexEntry.includes('Notification background task registration failed'),
  'Notification background task is not registered observably at startup',
)
requireCondition(
  !callNotificationTask.includes('displayIncomingCall('),
  'Background notification task must not expose answerable native call UI',
)
requireCondition(
  registrationCoordinator.includes('ensureVerifiedBackendAccess()')
    && registrationCoordinator.includes('accessToken: session.accessToken')
    && registrationCoordinator.includes('pushTokens: []'),
  'Active-wallet notification registration boundary is missing',
)

requireCondition(info.ITSAppUsesNonExemptEncryption === false, 'Unexpected native export declaration')
requireCondition(app.ios?.infoPlist?.ITSAppUsesNonExemptEncryption === false, 'Expo export declaration drift')
requireCondition(entitlements['aps-environment'] === 'production', 'Production APNS entitlement is missing')
requireCondition(
  entitlements['com.apple.security.application-groups']?.includes('group.org.spectramozaga.exo'),
  'Production app group entitlement is missing',
)
requireCondition(shareExtension.includes('import CryptoKit'), 'Share extension digest validation is missing')
requireCondition(shareExtension.includes('schemaVersion: 2'), 'Share extension manifest schema is stale')
requireCondition(shareExtension.includes('FileProtectionType.complete'), 'Share handoff files require complete protection')
requireCondition(shareExtension.includes('moveItem(at: stagingURL'), 'Share handoff copy is not finalized atomically')
requireCondition(shareExtension.includes('sha256Hex(of: stagingURL)'), 'Share handoff digest is missing')
requireCondition(
  mediaIngress.includes('stageAndValidateMediaIngress')
    && mediaIngress.includes('copyIntoAppOwnedIngress')
    && mediaIngress.includes('inspectMediaIngressBytes')
    && mediaIngress.includes('protectSensitiveFilePath(destinationUri)'),
  'Reusable media ingress validation is missing',
)
requireCondition(
  shareImport.includes('expectedDigest: digest')
    && shareImport.includes('requireDeclaredSizeMatch: true'),
  'Host share import does not close handoff TOCTOU',
)
requireCondition(
  nativeIntent.includes('TRUSTED_HTTPS_HOSTS')
    && nativeIntent.includes('assertUniqueSafeParams')
    && nativeIntent.includes('SENSITIVE_PARAM_NAME'),
  'Native URL allowlist hardening is missing',
)
requireCondition(
  mobileLogger.includes('sanitizeMobileLogFields')
    && mobileLogger.includes("typeof __DEV__ !== 'undefined'"),
  'Production-safe mobile log redaction is missing',
)

for (const path of [
  'services/call/callDiagnostics.ts',
  'services/chat/chatDiagnostics.ts',
  'services/media/mediaService.ts',
  'services/notifications/callNotificationTask.ts',
  'services/tor/torDiagnostics.ts',
]) {
  requireCondition(
    !/console\.(?:debug|error|info|log|warn)\s*\(/.test(read(path)),
    `Direct console logging bypasses mobile redaction in ${path}`,
  )
}

requireCondition(privacy.NSPrivacyTracking === false, 'Privacy manifest must disable tracking')
requireCondition(privacy.NSPrivacyTrackingDomains == null, 'Tracking domains must not be declared')
requireCondition(privacy.NSPrivacyCollectedDataTypes?.length > 0, 'Collected data declarations are missing')
requireCondition(
  privacy.NSPrivacyCollectedDataTypes.every((entry) => entry.NSPrivacyCollectedDataTypeTracking === false),
  'Collected data must not be marked for tracking',
)

requireCondition(manifest.includes('android:allowBackup="false"'), 'Android backup must be disabled')
requireCondition(manifest.includes('android:dataExtractionRules="@xml/secure_store_data_extraction_rules"'), 'Android extraction rules are missing')
requireCondition(
  /android:name="android.permission.BLUETOOTH_SCAN"[^>]*android:usesPermissionFlags="neverForLocation"/.test(manifest),
  'BLE scan must declare neverForLocation',
)
requireCondition(
  /android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" tools:node="replace"/.test(manifest),
  'Fine location must replace library copies and remain legacy-only for pre-Android 12 BLE',
)
requireCondition(
  /android:name="android.permission.ACCESS_COARSE_LOCATION" android:maxSdkVersion="30" tools:node="replace"/.test(manifest),
  'Coarse location must replace library copies and remain legacy-only for pre-Android 12 BLE',
)
requireCondition(
  /uses-permission-sdk-23 android:name="android.permission.ACCESS_FINE_LOCATION" tools:node="remove"/.test(manifest),
  'Expo sdk-23 fine location tags must be removed at merge time',
)
requireCondition(
  /uses-permission-sdk-23 android:name="android.permission.ACCESS_COARSE_LOCATION" tools:node="remove"/.test(manifest),
  'Expo sdk-23 coarse location tags must be removed at merge time',
)
requireCondition(
  app.plugins?.[0] === './plugins/withBleHardwareFeature',
  'BLE location hardening must run last among Expo config plugins',
)
requireCondition(
  gradle.includes('spectra-strip-sdk23-location'),
  'Gradle must strip Expo sdk-23 location tags from the merged Play manifest',
)
const blePatch = read('patches/react-native-ble-plx+3.5.1.patch')
requireCondition(
  !blePatch.includes('.gradle/'),
  'The ble-plx patch must not include local Gradle cache files',
)
requireCondition(
  blePatch.includes("androidManifest.manifest['uses-permission-sdk-23']"),
  'The ble-plx patch must stop writing Expo sdk-23 location tags',
)
requireCondition(
  /domain="sharedpref"\s+path="SecureStore"/.test(backupRules),
  'SecureStore backup exclusion is missing',
)
requireCondition(
  /domain="sharedpref"\s+path="SecureStore"/.test(extractionRules),
  'SecureStore transfer exclusion is missing',
)

const pinnedDomains = info.TSKConfiguration?.TSKPinnedDomains ?? {}
requireCondition(Object.keys(pinnedDomains).length > 0, 'iOS certificate pins are missing')
for (const [domain, value] of Object.entries(pinnedDomains)) {
  requireCondition(value.TSKPublicKeyHashes?.length >= 2, `${domain} requires primary and backup pins`)
}
requireCondition(
  Object.keys(pinnedDomains).every((domain) => domain === 'exp.host'),
  'Obsolete backend certificate pins remain in iOS configuration',
)
requireCondition(
  pinningPlugin.includes(productionBackendUrl),
  'The exact Supabase Edge backend URL is not enforced',
)
requireCondition(
  !/(?:backend[.]co|api[.]spectraprotocol[.]org|api[.]kara-intelligence[.]com)/.test(
    `${pinningPlugin}\n${networkSecurity}\n${JSON.stringify(pinnedDomains)}`,
  ),
  'Obsolete backend trust configuration remains',
)
const configuredBackendUrl = process.env.EXPO_PUBLIC_SPECTRA_API_URL?.replace(/\/+$/, '')
if (configuredBackendUrl && !/^http:\/\/(?:localhost|127[.]0[.]0[.]1|10[.]0[.]2[.]2)(?::\d+)?(?:\/|$)/.test(configuredBackendUrl)) {
  requireCondition(
    configuredBackendUrl === productionBackendUrl,
    'Production backend URL must target the Supabase Edge Function',
  )
}

console.log('Release source configuration verified.')
