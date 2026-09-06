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
const infoPlistPath = resolve(rootDir, 'ios', 'Spectra', 'Info.plist')
const localizedInfoPlistDir = resolve(rootDir, 'ios', 'Spectra')
const localizedShareExtensionDir = resolve(rootDir, 'ios', 'SpectraShareExtension')

const REQUIRED_INFO_PLIST_KEYS = [
  { key: 'ITSAppUsesNonExemptEncryption', assertMatches: assertMatchingBoolean },
  { key: 'NSBluetoothAlwaysUsageDescription', assertMatches: assertMatchingString },
  { key: 'NSBluetoothPeripheralUsageDescription', assertMatches: assertMatchingString },
  { key: 'NSFaceIDUsageDescription', assertMatches: assertMatchingString },
  { key: 'UIBackgroundModes', assertMatches: assertMatchingStringArray },
]

const REQUIRED_PLUGIN_PERMISSION_SETTINGS = [
  {
    plugin: 'expo-camera',
    option: 'cameraPermission',
    infoPlistKey: 'NSCameraUsageDescription',
  },
  {
    plugin: 'expo-av',
    option: 'microphonePermission',
    infoPlistKey: 'NSMicrophoneUsageDescription',
  },
  {
    plugin: 'expo-media-library',
    option: 'photosPermission',
    infoPlistKey: 'NSPhotoLibraryUsageDescription',
  },
  {
    plugin: 'expo-media-library',
    option: 'savePhotosPermission',
    infoPlistKey: 'NSPhotoLibraryAddUsageDescription',
  },
  {
    plugin: 'expo-local-authentication',
    option: 'faceIDPermission',
    infoPlistKey: 'NSFaceIDUsageDescription',
  },
]

const REQUIRED_SHARE_EXTENSION_STRING_KEYS = [
  'share_extension.title',
  'share_extension.preparing_private_handoff',
  'share_extension.import_failed',
]

const SHARE_EXTENSION_BRAND_KEYS = [
  'share_extension.title',
  'share_extension.import_failed',
]

function readPlist(path) {
  try {
    const json = execFileSync(
      'plutil',
      ['-convert', 'json', '-o', '-', path],
      { encoding: 'utf8' },
    )
    return JSON.parse(json)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse ${path} with plutil: ${message}`)
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse ${path} as JSON: ${message}`)
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is missing or empty`)
  }
}

function assertBoolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean`)
  }
}

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new Error(`${label} must be an array of non-empty strings`)
  }
}

function normalizeStringArray(values) {
  return [...new Set(values.map((value) => value.trim()))].sort()
}

function assertMatchingString(expected, actual, label) {
  assertNonEmptyString(expected, `${label}:expected`)
  assertNonEmptyString(actual, `${label}:actual`)
  if (expected !== actual) {
    throw new Error(`${label} values do not match`)
  }
}

function assertMatchingBoolean(expected, actual, label) {
  assertBoolean(expected, `${label}:expo-config`)
  assertBoolean(actual, `${label}:Info.plist`)
  if (expected !== actual) {
    throw new Error(`${label} does not match between expo config and Info.plist`)
  }
}

function assertMatchingStringArray(expected, actual, label) {
  assertStringArray(expected, `${label}:expo-config`)
  assertStringArray(actual, `${label}:Info.plist`)

  const normalizedExpected = normalizeStringArray(expected)
  const normalizedActual = normalizeStringArray(actual)

  if (JSON.stringify(normalizedExpected) !== JSON.stringify(normalizedActual)) {
    throw new Error(
      `${label} does not match between expo config and Info.plist.\n` +
      `Expected: ${normalizedExpected.join(', ')}\n` +
      `Actual: ${normalizedActual.join(', ')}`
    )
  }
}

function assertCompleteStringRecord(expected, actual, label) {
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) {
    throw new Error(`${label}: expected source must be an object`)
  }
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) {
    throw new Error(`${label}: localized values must be an object`)
  }

  const expectedKeys = Object.keys(expected)
  assertExactKeys(actual, expectedKeys, label)

  for (const key of expectedKeys) {
    assertNonEmptyString(expected[key], `${label}:source:${key}`)
    assertNonEmptyString(actual[key], `${label}:${key}`)
  }
}

function assertExactStringRecord(expected, actual, label) {
  assertCompleteStringRecord(expected, actual, label)

  for (const key of Object.keys(expected)) {
    assertMatchingString(expected[key], actual[key], `${label}:${key}`)
  }
}

function assertExactKeys(values, expectedKeys, label) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    throw new Error(`${label}: localized values must be an object`)
  }

  const normalizedExpectedKeys = [...expectedKeys].sort()
  const actualKeys = Object.keys(values).sort()
  if (JSON.stringify(normalizedExpectedKeys) !== JSON.stringify(actualKeys)) {
    throw new Error(
      `${label}: localized keys do not match.\n` +
      `Expected: ${normalizedExpectedKeys.join(', ')}\n` +
      `Actual: ${actualKeys.join(', ')}`
    )
  }
}

function assertStringsMatch(expected, actual, label) {
  for (const [key, value] of Object.entries(expected)) {
    assertMatchingString(value, actual[key], `${label}:${key}`)
  }
}

function getPluginOptions(plugins, pluginName) {
  const entry = plugins.find(
    (candidate) => Array.isArray(candidate) && candidate[0] === pluginName,
  )
  const options = entry?.[1]
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error(`expo config is missing options for ${pluginName}`)
  }
  return options
}

const appConfig = { expo: loadExpoAppConfig({ rootDir }) }
const infoPlistSource = appConfig?.expo?.ios?.infoPlist
if (!infoPlistSource || typeof infoPlistSource !== 'object') {
  throw new Error('expo config is missing ios.infoPlist')
}

const infoPlist = readPlist(infoPlistPath)

for (const { key, assertMatches } of REQUIRED_INFO_PLIST_KEYS) {
  const expectedValue = infoPlistSource[key]
  const actualValue = infoPlist[key]

  assertMatches(expectedValue, actualValue, key)
}

const configuredLocales = appConfig?.expo?.locales
if (!configuredLocales || typeof configuredLocales !== 'object' || Array.isArray(configuredLocales)) {
  throw new Error('expo config is missing locales')
}

const englishLocalePath = configuredLocales.en
if (typeof englishLocalePath !== 'string') {
  throw new Error('expo config is missing the English native locale')
}

const englishPermissions = readJson(resolve(rootDir, englishLocalePath))
assertStringsMatch(englishPermissions, infoPlist, 'locales/en.json:Info.plist')

const plugins = appConfig?.expo?.plugins
if (!Array.isArray(plugins)) {
  throw new Error('expo config is missing plugins')
}

for (const { plugin, option, infoPlistKey } of REQUIRED_PLUGIN_PERMISSION_SETTINGS) {
  const pluginOptions = getPluginOptions(plugins, plugin)
  assertMatchingString(
    englishPermissions[infoPlistKey],
    pluginOptions[option],
    `${plugin}:${option}`,
  )
}

for (const [locale, localePath] of Object.entries(configuredLocales)) {
  if (typeof localePath !== 'string') {
    throw new Error(`expo config locale ${locale} must reference a file`)
  }

  const permissions = readJson(resolve(rootDir, localePath))
  assertCompleteStringRecord(englishPermissions, permissions, `locales/${locale}.json`)

  const infoPlistStringsPath = resolve(
    localizedInfoPlistDir,
    `${locale}.lproj`,
    'InfoPlist.strings',
  )
  const localizedInfoPlist = readPlist(infoPlistStringsPath)
  assertExactStringRecord(
    permissions,
    localizedInfoPlist,
    `ios/Spectra/${locale}.lproj/InfoPlist.strings`,
  )
}

const englishShareStrings = readPlist(
  resolve(localizedShareExtensionDir, 'en.lproj', 'Localizable.strings'),
)
assertExactKeys(
  englishShareStrings,
  REQUIRED_SHARE_EXTENSION_STRING_KEYS,
  'ios/SpectraShareExtension/en.lproj/Localizable.strings',
)

for (const locale of Object.keys(configuredLocales)) {
  const shareStringsPath = resolve(
    localizedShareExtensionDir,
    `${locale}.lproj`,
    'Localizable.strings',
  )
  const shareStrings = readPlist(shareStringsPath)
  assertExactKeys(
    shareStrings,
    REQUIRED_SHARE_EXTENSION_STRING_KEYS,
    `ios/SpectraShareExtension/${locale}.lproj/Localizable.strings`,
  )

  for (const key of REQUIRED_SHARE_EXTENSION_STRING_KEYS) {
    assertNonEmptyString(shareStrings[key], `${locale}:${key}`)
  }
  for (const key of SHARE_EXTENSION_BRAND_KEYS) {
    if (!shareStrings[key].includes('Spectra')) {
      throw new Error(`${locale}:${key} must preserve the Spectra brand name`)
    }
  }
}

console.log('iOS privacy strings and native localization resources verified.')
