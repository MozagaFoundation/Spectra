/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'

type Handler = (...args: unknown[]) => void

class TestGesture {
  readonly kind: string
  readonly config: Record<string, unknown> = {}
  readonly children: TestGesture[] = []

  constructor(kind: string) {
    this.kind = kind
  }

  enabled(value: boolean): this {
    this.config.enabled = value
    return this
  }

  runOnJS(value: boolean): this {
    this.config.runOnJS = value
    return this
  }

  shouldCancelWhenOutside(value: boolean): this {
    this.config.shouldCancelWhenOutside = value
    return this
  }

  minDistance(value: number): this {
    this.config.minDistance = value
    return this
  }

  maxPointers(value: number): this {
    this.config.maxPointers = value
    return this
  }

  activeOffsetX(value: number | [number, number]): this {
    this.config.activeOffsetX = value
    return this
  }

  activeOffsetY(value: number | [number, number]): this {
    this.config.activeOffsetY = value
    return this
  }

  failOffsetX(value: number | [number, number]): this {
    this.config.failOffsetX = value
    return this
  }

  failOffsetY(value: number | [number, number]): this {
    this.config.failOffsetY = value
    return this
  }

  hitSlop(value: unknown): this {
    this.config.hitSlop = value
    return this
  }

  onBegin(handler: Handler): this {
    this.config.onBegin = handler
    return this
  }

  onStart(handler: Handler): this {
    this.config.onStart = handler
    return this
  }

  onUpdate(handler: Handler): this {
    this.config.onUpdate = handler
    return this
  }

  onChange(handler: Handler): this {
    this.config.onChange = handler
    return this
  }

  onEnd(handler: Handler): this {
    this.config.onEnd = handler
    return this
  }

  onFinalize(handler: Handler): this {
    this.config.onFinalize = handler
    return this
  }

  onTouchesDown(handler: Handler): this {
    this.config.onTouchesDown = handler
    return this
  }

  onTouchesUp(handler: Handler): this {
    this.config.onTouchesUp = handler
    return this
  }
}

class TestComposedGesture extends TestGesture {
  constructor(kind: string, gestures: TestGesture[]) {
    super(kind)
    this.children.push(...gestures)
  }
}

export const Gesture = {
  Pan: () => new TestGesture('Pan'),
  Tap: () => new TestGesture('Tap'),
  LongPress: () => new TestGesture('LongPress'),
  Fling: () => new TestGesture('Fling'),
  Pinch: () => new TestGesture('Pinch'),
  Rotation: () => new TestGesture('Rotation'),
  Race: (...gestures: TestGesture[]) => new TestComposedGesture('Race', gestures),
  Simultaneous: (...gestures: TestGesture[]) => new TestComposedGesture('Simultaneous', gestures),
  Exclusive: (...gestures: TestGesture[]) => new TestComposedGesture('Exclusive', gestures),
}

interface GestureDetectorProps {
  gesture: TestGesture
  children: React.ReactNode
}

export function GestureDetector({ gesture, children }: GestureDetectorProps) {
  return React.createElement(
    'GestureDetector' as unknown as React.ComponentType<Record<string, unknown>>,
    { gesture, gestureConfig: gesture?.config, gestureKind: gesture?.kind },
    children,
  )
}

interface GestureHandlerRootViewProps {
  children?: React.ReactNode
  style?: unknown
}

export function GestureHandlerRootView({ children, style }: GestureHandlerRootViewProps) {
  return React.createElement(
    'GestureHandlerRootView' as unknown as React.ComponentType<Record<string, unknown>>,
    { style },
    children,
  )
}

export const State = {
  UNDETERMINED: 0,
  FAILED: 1,
  BEGAN: 2,
  CANCELLED: 3,
  ACTIVE: 4,
  END: 5,
}

export const Directions = {
  RIGHT: 1,
  LEFT: 2,
  UP: 4,
  DOWN: 8,
}

export default {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  State,
  Directions,
}
