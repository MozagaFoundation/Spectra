/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { View } from 'react-native'
import { act, render } from '@testing-library/react-native'

type HookHarnessOptions<TProps> = {
  initialProps: TProps
  wrapper?: React.ComponentType<{ children: React.ReactNode }>
}

export function renderHook<TResult>(
  callback: () => TResult,
  options?: { wrapper?: React.ComponentType<{ children: React.ReactNode }> },
): {
  readonly result: TResult
  rerender: () => void
  unmount: () => void
} {
  return renderHookWithProps(callback, {
    initialProps: undefined,
    wrapper: options?.wrapper,
  })
}

export function renderHookWithProps<TProps, TResult>(
  callback: (props: TProps) => TResult,
  { initialProps, wrapper: Wrapper = React.Fragment }: HookHarnessOptions<TProps>,
): {
  readonly result: TResult
  rerender: (nextProps?: TProps) => void
  unmount: () => void
} {
  let latestResult!: TResult
  let props = initialProps

  function HookHarness() {
    latestResult = callback(props)
    return <View testID="hook-harness" />
  }

  const tree = render(
    <Wrapper>
      <HookHarness />
    </Wrapper>,
  )

  return {
    get result() {
      return latestResult
    },
    rerender(nextProps?: TProps) {
      if (arguments.length > 0) {
        props = nextProps as TProps
      }
      tree.update(
        <Wrapper>
          <HookHarness />
        </Wrapper>,
      )
    },
    unmount: tree.unmount,
  }
}

export async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}
