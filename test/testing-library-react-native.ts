/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import ReactTestRenderer, { act, type ReactTestInstance } from 'react-test-renderer'
import { afterEach } from 'vitest'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let currentRenderer: ReactTestRenderer.ReactTestRenderer | null = null
let cleanupRegistered = false

export function cleanup(): void {
  if (!currentRenderer) {
    return
  }

  act(() => {
    currentRenderer?.unmount()
    currentRenderer = null
  })
}

function registerAutoCleanup(): void {
  if (cleanupRegistered) {
    return
  }

  cleanupRegistered = true
  afterEach(() => {
    cleanup()
  })
}

registerAutoCleanup()

function requireRenderer(): ReactTestRenderer.ReactTestRenderer {
  if (!currentRenderer) {
    throw new Error('No React Native test tree has been rendered')
  }

  return currentRenderer
}

function textContent(node: ReactTestInstance): string {
  return node.children.map((child) => (
    typeof child === 'string' ? child : textContent(child)
  )).join('')
}

function matchesText(node: ReactTestInstance, text: string | RegExp): boolean {
  const content = textContent(node)
  if (typeof text === 'string') {
    return content === text
  }

  text.lastIndex = 0
  return text.test(content)
}

function hasMatchingTextDescendant(node: ReactTestInstance, text: string | RegExp): boolean {
  return node.children.some((child) => {
    if (typeof child === 'string') {
      return false
    }
    if (typeof child.type === 'string') {
      return matchesText(child, text) || hasMatchingTextDescendant(child, text)
    }
    // Keep walking until a host descendant is reached.
    return hasMatchingTextDescendant(child, text)
  })
}

function getAllByPredicate(
  predicate: (node: ReactTestInstance) => boolean,
): ReactTestInstance[] {
  return requireRenderer().root.findAll(predicate)
}

function getSingle(
  nodes: ReactTestInstance[],
  description: string,
): ReactTestInstance {
  if (nodes.length === 0) {
    throw new Error(`Unable to find ${description}`)
  }
  if (nodes.length > 1) {
    throw new Error(`Found multiple nodes for ${description}`)
  }

  return nodes[0]
}

export const screen = {
  getByTestId(testID: string): ReactTestInstance {
    return getSingle(
      getAllByPredicate((node) => node.props.testID === testID),
      `testID ${testID}`,
    )
  },

  queryByTestId(testID: string): ReactTestInstance | null {
    const matches = getAllByPredicate((node) => node.props.testID === testID)
    return matches[0] ?? null
  },

  getByText(text: string | RegExp): ReactTestInstance {
    return getSingle(
      getAllByPredicate((node) => (
        typeof node.type === 'string'
        && matchesText(node, text)
        && !hasMatchingTextDescendant(node, text)
      )),
      `text ${String(text)}`,
    )
  },

  getAllByText(text: string | RegExp): ReactTestInstance[] {
    return getAllByPredicate((node) => (
      typeof node.type === 'string'
      && matchesText(node, text)
      && !hasMatchingTextDescendant(node, text)
    ))
  },
}

export function render(element: React.ReactElement) {
  cleanup()

  act(() => {
    currentRenderer = ReactTestRenderer.create(element)
  })

  return {
    ...screen,
    root: requireRenderer().root,
    unmount: cleanup,
    update: (nextElement: React.ReactElement) => {
      act(() => {
        requireRenderer().update(nextElement)
      })
    },
  }
}

export const fireEvent = {
  async press(node: ReactTestInstance): Promise<void> {
    if (node.props.disabled || node.props.accessibilityState?.disabled) {
      return
    }

    await act(async () => {
      await node.props.onPress?.({ nativeEvent: {} })
    })
  },

  async changeText(node: ReactTestInstance, value: string): Promise<void> {
    await act(async () => {
      await node.props.onChangeText?.(value)
    })
  },
}

export { act }
