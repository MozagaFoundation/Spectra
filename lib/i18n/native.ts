/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { Alert, type AlertButton, type AlertOptions } from 'react-native'

let alertPatched = false

export function patchReactNativeAlerts(): void {
  if (alertPatched) {
    return
  }

  const originalAlert = Alert.alert.bind(Alert)

  Alert.alert = ((
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: AlertOptions,
  ) => originalAlert(
    title,
    message,
    buttons,
    options,
  )) as typeof Alert.alert

  alertPatched = true
}
