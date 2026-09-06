/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/** Copy to app.config.local.js and fill in your identifiers. Never commit app.config.local.js. */
module.exports = {
  ios: {
    bundleIdentifier: 'com.example.spectra',
    appleTeamId: 'REPLACE_WITH_APPLE_TEAM_ID',
    infoPlist: {
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: false,
        NSAllowsLocalNetworking: true,
      },
    },
    entitlements: {
      'com.apple.security.application-groups': [
        'group.com.example.spectra',
      ],
    },
  },
  android: {
    package: 'com.example.spectra',
  },
  extra: {
    eas: {
      projectId: '00000000-0000-0000-0000-000000000000',
    },
  },
}
