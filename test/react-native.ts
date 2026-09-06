/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'

type HostComponent = React.ComponentType<Record<string, unknown>>
export type AppStateStatus = 'active' | 'background' | 'inactive' | 'unknown' | 'extension'

(globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__ = true

function host(name: string): HostComponent {
  return name as unknown as HostComponent
}

export const View = host('View')
export const SafeAreaView = host('SafeAreaView')
export const KeyboardAvoidingView = host('KeyboardAvoidingView')
export const InputAccessoryView = host('InputAccessoryView')
export const Text = host('Text')
export const Pressable = host('Pressable')
export const TouchableOpacity = host('TouchableOpacity')
export const TouchableWithoutFeedback = host('TouchableWithoutFeedback')
export const TextInput = host('TextInput')
export const ActivityIndicator = host('ActivityIndicator')
export const RefreshControl = host('RefreshControl')
export const ScrollView = host('RCTScrollView')
export const FlatList = ({
  data = [],
  ItemSeparatorComponent,
  keyExtractor,
  renderItem,
  ...props
}: {
  data?: unknown[]
  ItemSeparatorComponent?: React.ComponentType
  keyExtractor?: (item: unknown, index: number) => string
  renderItem?: (info: { item: unknown; index: number }) => React.ReactNode
} & Record<string, unknown>) => React.createElement(
  View,
  props,
  data.flatMap((item, index) => {
    const rendered = renderItem?.({ item, index })
    const key = keyExtractor?.(item, index) ?? String(index)
    const nodes = [React.createElement(View, { key }, rendered)]
    if (ItemSeparatorComponent && index < data.length - 1) {
      nodes.push(React.createElement(ItemSeparatorComponent, { key: `${key}-separator` }))
    }
    return nodes
  }),
)
export const Image = host('Image')
export const ImageBackground = host('ImageBackground')
export const Modal = host('Modal')
export const Switch = host('RCTSwitch')
export const Alert = {
  alert: () => {},
}
export const Linking = {
  canOpenURL: async () => true,
  openURL: async () => undefined,
  openSettings: async () => undefined,
}
export const Share = {
  share: async () => ({ action: 'sharedAction' }),
  sharedAction: 'sharedAction',
  dismissedAction: 'dismissedAction',
}

export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T): T => styles,
  flatten: (style: unknown): Record<string, unknown> | undefined => {
    if (!style) return undefined
    if (Array.isArray(style)) {
      return Object.assign({}, ...style.filter(Boolean).map((entry) => StyleSheet.flatten(entry)))
    }
    return typeof style === 'object' ? style as Record<string, unknown> : undefined
  },
  absoluteFillObject: {},
}

export const Dimensions = {
  get: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
  addEventListener: () => ({ remove: () => {} }),
}

export const Platform = {
  OS: 'ios',
  Version: 'test',
  select: <T,>(values: { ios?: T; android?: T; default?: T }): T | undefined => (
    values.ios ?? values.default
  ),
}

export const Keyboard = {
  dismiss: () => {},
  addListener: () => ({ remove: () => {} }),
}

export const BackHandler = {
  addEventListener: () => ({ remove: () => {} }),
  exitApp: () => {},
}

export const AppState = {
  currentState: 'active' as AppStateStatus,
  addEventListener: () => ({ remove: () => {} }),
}

export const InteractionManager = {
  runAfterInteractions: (callback: () => void) => {
    callback()
    return { cancel: () => {} }
  },
}

export const AccessibilityInfo = {
  isScreenReaderEnabled: async () => false,
  addEventListener: () => ({ remove: () => {} }),
  announceForAccessibility: () => {},
}

export const I18nManager = {
  isRTL: false,
}

export const NativeModules = {}
export class NativeEventEmitter {
  addListener() {
    return { remove: () => {} }
  }
  removeAllListeners() {}
  removeSubscription() {}
}
export const DeviceEventEmitter = {
  addListener: () => ({ remove: () => {} }),
}
export const TurboModuleRegistry = {
  get: () => null,
  getEnforcing: () => ({}),
}
export const PixelRatio = {
  get: () => 3,
  getFontScale: () => 1,
  roundToNearestPixel: (value: number) => value,
}

export const PanResponder = {
  create: (config: Record<string, unknown>) => ({
    panHandlers: {
      onStartShouldSetResponder: config.onStartShouldSetPanResponder,
      onMoveShouldSetResponder: config.onMoveShouldSetPanResponder,
      onResponderGrant: config.onPanResponderGrant,
      onResponderMove: config.onPanResponderMove,
      onResponderRelease: config.onPanResponderRelease,
      onResponderTerminate: config.onPanResponderTerminate,
    },
  }),
}

export const Animated = {
  View,
  Text,
  createAnimatedComponent: (component: HostComponent) => component,
  spring: () => ({ start: (callback?: () => void) => callback?.() }),
  timing: () => ({ start: (callback?: () => void) => callback?.() }),
  Value: class {
    constructor(public value: number) {}
    setValue(value: number) {
      this.value = value
    }
    interpolate(_config?: unknown) {
      return this.value
    }
    stopAnimation() {}
  },
}

export const useColorScheme = () => 'dark'
export const useWindowDimensions = () => Dimensions.get()
export const findNodeHandle = () => 1

export default {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  BackHandler,
  Dimensions,
  DeviceEventEmitter,
  FlatList,
  findNodeHandle,
  I18nManager,
  InteractionManager,
  Image,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  NativeEventEmitter,
  NativeModules,
  PanResponder,
  PixelRatio,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TurboModuleRegistry,
  useColorScheme,
  useWindowDimensions,
  View,
}
