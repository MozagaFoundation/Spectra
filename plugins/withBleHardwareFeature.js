/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

const {
  createRunOncePlugin,
  withAndroidManifest,
  withAppBuildGradle,
  withFinalizedMod,
} = require('expo/config-plugins')
const fs = require('fs')
const path = require('path')

const BLE_FEATURE = 'android.hardware.bluetooth_le'
const BLE_SCAN_PERMISSION = 'android.permission.BLUETOOTH_SCAN'
const LOCATION_PERMISSIONS = [
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
]
const LEGACY_BLE_LOCATION_MAX_SDK = '30'
const PERMISSION_LIST_KEYS = ['uses-permission', 'uses-permission-sdk-23']
const GRADLE_STRIP_MARKER = 'spectra-strip-sdk23-location'
const GRADLE_STRIP_SNIPPET = `
// ${GRADLE_STRIP_MARKER}
def spectraStripSdk23LocationTags(File target, boolean keepMergerRemoveTags) {
    if (target == null || !target.exists() || target.name != "AndroidManifest.xml") {
        return
    }
    def original = target.getText("UTF-8")
    def stripped = keepMergerRemoveTags
        ? original.replaceAll(
            "(?i)\\\\s*<uses-permission-sdk-23\\\\b(?![^>]*tools:node=\\"remove\\")[^>]*ACCESS_(?:FINE|COARSE)_LOCATION[^>]*/>",
            ""
        )
        : original.replaceAll(
            "(?i)\\\\s*<uses-permission-sdk-23\\\\b[^>]*ACCESS_(?:FINE|COARSE)_LOCATION[^>]*/>",
            ""
        )
    if (stripped != original) {
        target.write(stripped, "UTF-8")
        logger.lifecycle("Spectra: stripped uses-permission-sdk-23 location tags from \${target}")
    }
    if (!keepMergerRemoveTags && stripped =~ /(?i)uses-permission-sdk-23[^>]*ACCESS_(?:FINE|COARSE)_LOCATION/) {
        throw new GradleException("Play duplicate location permissions remain in \${target}")
    }
}

tasks.configureEach { task ->
    if (task.name == "preBuild") {
        task.doFirst {
            spectraStripSdk23LocationTags(file("src/main/AndroidManifest.xml"), true)
        }
    }
    if (task.name.matches(/process.*Manifest/) || task.name.matches(/package.*Manifest/)) {
        task.doLast {
            task.outputs.files.files.each { output ->
                if (output.isDirectory()) {
                    output.eachFileRecurse { nested ->
                        if (nested.name == "AndroidManifest.xml") {
                            spectraStripSdk23LocationTags(nested, false)
                        }
                    }
                } else if (output.name == "AndroidManifest.xml") {
                    spectraStripSdk23LocationTags(output, false)
                }
            }
        }
    }
}
`

function asArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function permissionName(entry) {
  return entry?.$?.['android:name']
}

function mergeToolsReplace(entry, attribute) {
  const current = entry.$['tools:replace']
  if (!current) {
    entry.$['tools:replace'] = attribute
    return
  }
  const parts = current.split(',').map((part) => part.trim()).filter(Boolean)
  if (!parts.includes(attribute)) parts.push(attribute)
  entry.$['tools:replace'] = parts.join(',')
}

function findPermission(manifest, name) {
  for (const key of PERMISSION_LIST_KEYS) {
    const list = asArray(manifest[key])
    const entry = list.find((permission) => permissionName(permission) === name)
    if (entry) return { key, entry, list }
  }
  return null
}

function ensureUsesPermission(manifest, name) {
  const existing = findPermission(manifest, name)
  if (existing?.key === 'uses-permission') return existing.entry

  if (existing) {
    existing.list.splice(existing.list.indexOf(existing.entry), 1)
    if (existing.list.length) manifest[existing.key] = existing.list
    else delete manifest[existing.key]
  }

  const list = asArray(manifest['uses-permission'])
  const entry = { $: { 'android:name': name } }
  list.push(entry)
  manifest['uses-permission'] = list
  return entry
}

function ensureToolsNamespace(manifest) {
  manifest.$ = manifest.$ ?? {}
  if (!manifest.$['xmlns:tools']) {
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools'
  }
}

function removeNamedPermissions(manifest, names) {
  const nameSet = new Set(names)
  for (const key of PERMISSION_LIST_KEYS) {
    const list = asArray(manifest[key]).filter(
      (permission) => !nameSet.has(permissionName(permission)),
    )
    if (list.length) manifest[key] = list
    else delete manifest[key]
  }
}

function resolveInnerManifest(modResults) {
  if (modResults?.manifest && typeof modResults.manifest === 'object') {
    return modResults.manifest
  }
  return modResults
}

function stripSdk23LocationPermissionsXml(xml) {
  return xml.replace(
    /\s*<uses-permission-sdk-23\b(?![^>]*tools:node="remove")[^>]*ACCESS_(?:FINE|COARSE)_LOCATION[^>]*\/?\s*>/gi,
    '',
  )
}

function applyBleLocationHardening(manifest) {
  ensureToolsNamespace(manifest)

  const features = asArray(manifest['uses-feature'])
  const existingFeature = features.find(
    (feature) => feature.$?.['android:name'] === BLE_FEATURE,
  )
  if (existingFeature) {
    existingFeature.$['android:required'] = 'false'
  } else {
    features.push({
      $: {
        'android:name': BLE_FEATURE,
        'android:required': 'false',
      },
    })
  }
  manifest['uses-feature'] = features

  const scanPermission = ensureUsesPermission(manifest, BLE_SCAN_PERMISSION)
  scanPermission.$['android:usesPermissionFlags'] = 'neverForLocation'
  mergeToolsReplace(scanPermission, 'android:usesPermissionFlags')

  removeNamedPermissions(manifest, LOCATION_PERMISSIONS)
  const permissions = asArray(manifest['uses-permission'])
  for (const name of LOCATION_PERMISSIONS) {
    permissions.push({
      $: {
        'android:name': name,
        'android:maxSdkVersion': LEGACY_BLE_LOCATION_MAX_SDK,
        'tools:node': 'replace',
      },
    })
  }
  manifest['uses-permission'] = permissions
  manifest['uses-permission-sdk-23'] = LOCATION_PERMISSIONS.map((name) => ({
    $: {
      'android:name': name,
      'tools:node': 'remove',
    },
  }))

  return manifest
}

const withBleHardwareFeature = (config) => {
  config = withAndroidManifest(config, (manifestConfig) => {
    applyBleLocationHardening(resolveInnerManifest(manifestConfig.modResults))
    return manifestConfig
  })
  config = withAppBuildGradle(config, (gradleConfig) => {
    if (!gradleConfig.modResults.contents.includes(GRADLE_STRIP_MARKER)) {
      gradleConfig.modResults.contents += `\n${GRADLE_STRIP_SNIPPET}\n`
    }
    return gradleConfig
  })
  config = withFinalizedMod(config, ['android', async (modConfig) => {
    const manifestPath = path.join(
      modConfig.modRequest.platformProjectRoot,
      'app/src/main/AndroidManifest.xml',
    )
    const original = fs.readFileSync(manifestPath, 'utf8')
    const next = stripSdk23LocationPermissionsXml(original)
    if (next !== original) fs.writeFileSync(manifestPath, next)
    return modConfig
  }])
  return config
}

const plugin = createRunOncePlugin(
  withBleHardwareFeature,
  'with-ble-hardware-feature',
  '1.4.0',
)
plugin.applyBleLocationHardening = applyBleLocationHardening
plugin.stripSdk23LocationPermissionsXml = stripSdk23LocationPermissionsXml

module.exports = plugin
