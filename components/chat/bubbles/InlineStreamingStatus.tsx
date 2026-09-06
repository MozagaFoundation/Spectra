/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { memo } from 'react'
import { Text } from 'react-native'

const STATUS_DOTS = ['.', '..', '...', '.']

export const InlineStreamingStatus = memo(function InlineStreamingStatus({
  text,
  isOwn,
}: {
  text: string
  isOwn: boolean
}) {
  const [dotIndex, setDotIndex] = React.useState(0)

  React.useEffect(() => {
    const timer = setInterval(() => {
      setDotIndex((current) => (current + 1) % STATUS_DOTS.length)
    }, 450)
    return () => clearInterval(timer)
  }, [])

  const baseText = text.replace(/\.+\s*$/, '')

  return (
    <Text className={`text-xs mt-2 ${isOwn ? 'text-white/70' : 'text-text-muted'}`}>
      {baseText}{STATUS_DOTS[dotIndex]}
    </Text>
  )
})
