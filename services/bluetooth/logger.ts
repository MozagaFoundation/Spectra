/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/** Logger for BLE mesh modules. */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_PREFIX = 'BLE'

const debugEnabled = typeof __DEV__ !== 'undefined' ? __DEV__ : false

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.message}\n${a.stack ?? ''}`
      if (typeof a === 'object' && a !== null) {
        try {
          return JSON.stringify(a, null, 0)
        } catch {
          return String(a)
        }
      }
      return String(a)
    })
    .join(' ')
}

function log(level: LogLevel, module: string, message: string, ...args: unknown[]): void {
  const ts = new Date().toISOString().slice(11, 23)
  const prefix = `[${LOG_PREFIX}::${module}]`
  const suffix = debugEnabled && args.length > 0 ? ` | ${formatArgs(args)}` : ''
  const line = `${ts} ${prefix} ${message}${suffix}`

  switch (level) {
    case 'debug':
      if (debugEnabled) console.log(line)
      break
    case 'info':
      if (debugEnabled) console.log(line)
      break
    case 'warn':
      console.warn(line)
      break
    case 'error':
      console.error(line)
      break
  }
}

export function createLogger(module: string) {
  return {
    debug: (msg: string, ...args: unknown[]) => log('debug', module, msg, ...args),
    info: (msg: string, ...args: unknown[]) => log('info', module, msg, ...args),
    warn: (msg: string, ...args: unknown[]) => log('warn', module, msg, ...args),
    error: (msg: string, ...args: unknown[]) => log('error', module, msg, ...args),
  }
}
