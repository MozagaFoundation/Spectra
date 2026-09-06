/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/** Entry point with only required pre-router setup. */

require('./polyfills')

try {
  const { registerCallNotificationTask } = require('./services/notifications/callNotificationTask')
  Promise.resolve(registerCallNotificationTask()).catch(() => {
    console.warn('Notification background task registration failed')
  })
} catch (_) {
  console.warn('Notification background task bootstrap failed')
}

require('expo-router/entry')
