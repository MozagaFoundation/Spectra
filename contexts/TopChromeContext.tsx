/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { createContext, useContext } from 'react'

const TopChromeHeightContext = createContext(0)

export function resolveTopChromeHeight(
  measuredHeight: number,
  liveChromeVisible: boolean,
): number {
  return liveChromeVisible ? measuredHeight : 0
}

export function TopChromeHeightProvider({
  children,
  value,
}: {
  children: React.ReactNode
  value: number
}) {
  return (
    <TopChromeHeightContext.Provider value={value}>
      {children}
    </TopChromeHeightContext.Provider>
  )
}

export function useTopChromeHeight(): number {
  return useContext(TopChromeHeightContext)
}
