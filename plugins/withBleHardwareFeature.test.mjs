/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import blePlugin from './withBleHardwareFeature.js'

const applyBleLocationHardening = blePlugin.applyBleLocationHardening

function permission(name, extras = {}) {
  return { $: { 'android:name': name, ...extras } }
}

describe('withBleHardwareFeature location hardening', () => {
  it('collapses duplicate location permissions into one replaced legacy entry', () => {
    const manifest = applyBleLocationHardening({
      'uses-permission': [
        permission('android.permission.BLUETOOTH_SCAN'),
        permission('android.permission.ACCESS_FINE_LOCATION'),
      ],
      'uses-permission-sdk-23': [
        permission('android.permission.ACCESS_COARSE_LOCATION'),
        permission('android.permission.ACCESS_FINE_LOCATION'),
      ],
    })

    expect(manifest['uses-feature']).toEqual([
      { $: { 'android:name': 'android.hardware.bluetooth_le', 'android:required': 'false' } },
    ])
    expect(manifest['uses-permission']).toEqual([
      permission('android.permission.BLUETOOTH_SCAN', {
        'android:usesPermissionFlags': 'neverForLocation',
        'tools:replace': 'android:usesPermissionFlags',
      }),
      permission('android.permission.ACCESS_FINE_LOCATION', {
        'android:maxSdkVersion': '30',
        'tools:node': 'replace',
      }),
      permission('android.permission.ACCESS_COARSE_LOCATION', {
        'android:maxSdkVersion': '30',
        'tools:node': 'replace',
      }),
    ])
    expect(manifest['uses-permission-sdk-23']).toEqual([
      permission('android.permission.ACCESS_FINE_LOCATION', { 'tools:node': 'remove' }),
      permission('android.permission.ACCESS_COARSE_LOCATION', { 'tools:node': 'remove' }),
    ])
    expect(manifest.$['xmlns:tools']).toBe('http://schemas.android.com/tools')
  })

  it('strips Expo sdk-23 location tags that Play treats as a second maxSdkVersion', () => {
    const xml = `  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" tools:node="replace"/>
  <uses-permission-sdk-23 android:name="android.permission.ACCESS_FINE_LOCATION" tools:node="remove"/>
  <uses-permission-sdk-23 android:name="android.permission.ACCESS_FINE_LOCATION"/>
  <uses-permission-sdk-23 android:name="android.permission.ACCESS_COARSE_LOCATION" android:maxSdkVersion="28"/>`
    expect(blePlugin.stripSdk23LocationPermissionsXml(xml)).toBe(
      `  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" tools:node="replace"/>
  <uses-permission-sdk-23 android:name="android.permission.ACCESS_FINE_LOCATION" tools:node="remove"/>`,
    )
  })

  it('adds a missing BLE scan permission instead of leaving location-capable scanning', () => {
    const manifest = applyBleLocationHardening({})

    expect(manifest['uses-permission']).toEqual([
      permission('android.permission.BLUETOOTH_SCAN', {
        'android:usesPermissionFlags': 'neverForLocation',
        'tools:replace': 'android:usesPermissionFlags',
      }),
      permission('android.permission.ACCESS_FINE_LOCATION', {
        'android:maxSdkVersion': '30',
        'tools:node': 'replace',
      }),
      permission('android.permission.ACCESS_COARSE_LOCATION', {
        'android:maxSdkVersion': '30',
        'tools:node': 'replace',
      }),
    ])
  })
})
