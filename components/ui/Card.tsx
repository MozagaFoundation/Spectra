/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { type ComponentProps } from 'react'
import { View } from 'react-native'
import { cn } from '@/lib/utils'

type CardProps = ComponentProps<typeof View> & {
  className?: string
}

export function Card({
  children,
  className,
  ...props
}: CardProps) {
  return (
    <View {...props} className={cn('rounded-2xl bg-surface', className)}>
      {children}
    </View>
  )
}
