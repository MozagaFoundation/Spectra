/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { EXO_ADDRESS_REGEX, EXO_ADDRESS_LENGTH } from './constants'
import { formatLocalizedNumber } from './amounts'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { getCurrentLocaleTag, translate } from '@/lib/i18n'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isValidEXOAddress(address: string): boolean {
  if (!address || address.length !== EXO_ADDRESS_LENGTH) {
    return false
  }
  return EXO_ADDRESS_REGEX.test(address)
}

export function formatAddress(address: string, chars: number = 6): string {
  if (!address || address.length < chars * 2 + 3) return address
  return `${address.slice(0, chars + 3)}...${address.slice(-chars)}`
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString(getCurrentLocaleTag(), {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) {
    return translate('date.today')
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return translate('date.yesterday')
  }
  return date.toLocaleDateString(getCurrentLocaleTag(), {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return translate('relativeTime.justNow')
  if (minutes < 60) return translate('relativeTime.minute', { count: minutes })
  if (hours < 24) return translate('relativeTime.hour', { count: hours })
  if (days < 7) return translate('relativeTime.day', { count: days })
  
  return formatDate(timestamp)
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}

const URL_SPLIT_REGEX = /(https?:\/\/[^\s]+)/g
const URL_TEST_REGEX = /^https?:\/\/[^\s]+$/

export function parseLinks(text: string): Array<{ type: 'text' | 'link'; content: string }> {
  const parts = text.split(URL_SPLIT_REGEX)
  
  return parts
    .filter(part => part.length > 0)
    .map(part => ({
      type: (URL_TEST_REGEX.test(part) ? 'link' : 'text') as 'text' | 'link',
      content: part,
    }))
}

export function groupMessagesByDate<T extends { timestamp: number }>(
  messages: T[]
): Array<{ date: string; messages: T[] }> {
  const groups: Array<{ date: string; messages: T[] }> = []
  let currentDate = ''

  for (const message of messages) {
    const messageDate = new Date(message.timestamp).toDateString()
    
    if (messageDate !== currentDate) {
      currentDate = messageDate
      groups.push({ date: messageDate, messages: [message] })
    } else {
      groups[groups.length - 1].messages.push(message)
    }
  }

  return groups
}

export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex
  if (cleanHex.length % 2 !== 0) {
    throw new Error('Invalid hex string length')
  }
  if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
    throw new Error('Invalid hex string')
  }
  const bytes = new Uint8Array(cleanHex.length / 2)
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16)
  }
  return bytes
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${translate('fileSize.B')}`
  const k = 1024
  const sizes = [
    translate('fileSize.B'),
    translate('fileSize.KB'),
    translate('fileSize.MB'),
    translate('fileSize.GB'),
  ]
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
  return `${formatLocalizedNumber(bytes / Math.pow(k, i), {
    maximumFractionDigits: 1,
  })} ${sizes[i]}`
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new RangeError('concurrency must be a positive integer')
  }

  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++
      results[i] = await fn(items[i], i)
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  )
  await Promise.all(workers)
  return results
}

export async function mapWithConcurrencySettled<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  fallback: (item: T, index: number, error: unknown) => R,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new RangeError('concurrency must be a positive integer')
  }

  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++
      try {
        results[i] = await fn(items[i], i)
      } catch (error) {
        results[i] = fallback(items[i], i, error)
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  )
  await Promise.all(workers)
  return results
}

export function debounce<T extends (...args: Parameters<T>) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => {
      func(...args)
    }, wait)
  }
}
