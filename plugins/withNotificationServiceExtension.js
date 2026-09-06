/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

const { createRunOncePlugin, withXcodeProject } = require('expo/config-plugins')

const NSE_TARGET = 'SpectraNotificationService'
const NSE_BUNDLE_ID = 'org.spectramozaga.exo.NotificationService'
const MIN_IOS = '15.1'

const withNotificationServiceExtension = (config) =>
  withXcodeProject(config, (projectConfig) => {
    const project = projectConfig.modResults
    const nativeTargets = project.pbxNativeTargetSection?.() ?? {}
    const hasNse = Object.values(nativeTargets).some(
      (target) => target && target.name === NSE_TARGET,
    )
    if (!hasNse) {
      throw new Error(
        'SpectraNotificationService target is missing from ios/Spectra.xcodeproj. Restore the committed Xcode project instead of generating a new one.',
      )
    }
    const configs = project.pbxXCBuildConfigurationSection()
    for (const key of Object.keys(configs)) {
      const entry = configs[key]
      if (!entry?.buildSettings || entry.buildSettings.PRODUCT_BUNDLE_IDENTIFIER !== NSE_BUNDLE_ID) {
        continue
      }
      entry.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = MIN_IOS
      entry.buildSettings.APPLICATION_EXTENSION_API_ONLY = 'YES'
    }
    return projectConfig
  })

module.exports = createRunOncePlugin(
  withNotificationServiceExtension,
  'withNotificationServiceExtension',
  '1.0.0',
)
