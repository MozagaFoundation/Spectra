/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import {
  KeyboardAvoidingView as NativeKeyboardAvoidingView,
  Platform,
  type KeyboardAvoidingViewProps as NativeKeyboardAvoidingViewProps,
} from 'react-native'
import {
  KeyboardAvoidingView as ControllerKeyboardAvoidingView,
  type KeyboardAvoidingViewProps as ControllerKeyboardAvoidingViewProps,
} from 'react-native-keyboard-controller'

type KeyboardAvoidingViewProps = ControllerKeyboardAvoidingViewProps

export function KeyboardAvoidingView(props: React.PropsWithChildren<KeyboardAvoidingViewProps>) {
  if (Platform.OS === 'ios') {
    const { behavior = 'padding', ...nativeProps } = props
    const nativeBehavior = behavior === 'translate-with-padding' ? 'padding' : behavior

    return (
      <NativeKeyboardAvoidingView
        {...(nativeProps as NativeKeyboardAvoidingViewProps)}
        behavior={nativeBehavior}
      />
    )
  }

  return <ControllerKeyboardAvoidingView {...props} />
}
