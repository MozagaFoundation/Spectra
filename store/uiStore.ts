/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { create } from 'zustand'
import { getAppKeyValueStorage } from '@/services/storage/keyValueStorage'
import { InteractionManager } from 'react-native'
import { isAppLanguage } from '@/lib/i18n/languages'
import type { Toast } from '@/lib/types'
import { setAppLanguage } from '@/lib/i18n'
import type { AppLanguage } from '@/lib/i18n/resources'
import { generateId } from '@/lib/utils'
import { STORAGE_KEYS, MESSAGE_FONT_SIZES, type MessageFontSize } from '@/lib/constants'

const toastTimers = new Map<string, ReturnType<typeof setTimeout>>()
const I18N_LATENCY_LOG_PREFIX = '[I18N]'
const DEFAULT_FIAT_CURRENCY = 'USD'
let languagePersistenceVersion = 0

function logLanguageLatency(event: string, details: Record<string, unknown>): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(I18N_LATENCY_LOG_PREFIX, event, details)
  }
}

export type ChatBackground =
  | { type: 'none' }
  | { type: 'preset'; id: string }
  | { type: 'custom'; uri: string }

export type FiatCurrencyCode = string

function normalizeFiatCurrency(value: unknown): FiatCurrencyCode {
  return typeof value === 'string' && /^[A-Za-z]{3}$/.test(value.trim())
    ? value.trim().toUpperCase()
    : DEFAULT_FIAT_CURRENCY
}

interface UIState {
  isDarkMode: boolean
  
  messageFontSize: MessageFontSize

  chatBackground: ChatBackground

  preferredFiatCurrency: FiatCurrencyCode

  appLanguage: AppLanguage | null
  languageChosen: boolean
  
  toasts: Toast[]
  
  showToast: (toast: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
  clearToasts: () => void
  
  setMessageFontSize: (size: MessageFontSize) => Promise<void>
  setChatBackground: (bg: ChatBackground) => Promise<void>
  setPreferredFiatCurrency: (code: FiatCurrencyCode) => Promise<void>
  setTheme: (isDark: boolean) => Promise<void>
  setAppLanguageChoice: (lang: AppLanguage) => Promise<void>
  loadSettings: () => Promise<void>
}

export const useUIStore = create<UIState>((set, get) => ({
  isDarkMode: true,
  messageFontSize: 'large',
  chatBackground: { type: 'none' } as ChatBackground,
  preferredFiatCurrency: DEFAULT_FIAT_CURRENCY,
  appLanguage: null,
  languageChosen: false,
  toasts: [],

  showToast: (toast) => {
    const id = generateId()
    const duration = toast.duration || 3000
    const newToast: Toast = {
      ...toast,
      id,
      duration,
    }
    
    set((state) => ({
      toasts: [...state.toasts, newToast],
    }))
    
    const timer = setTimeout(() => {
      toastTimers.delete(id)
      get().dismissToast(id)
    }, duration)
    toastTimers.set(id, timer)
  },

  dismissToast: (id) => {
    const timer = toastTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      toastTimers.delete(id)
    }
    
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  },

  clearToasts: () => {
    for (const timer of toastTimers.values()) {
      clearTimeout(timer)
    }
    toastTimers.clear()
    set({ toasts: [] })
  },

  setMessageFontSize: async (size) => {
    set({ messageFontSize: size })
    
    try {
      const settingsStr = await getAppKeyValueStorage().getItem(STORAGE_KEYS.USER_SETTINGS)
      const settings = settingsStr ? JSON.parse(settingsStr) : {}
      settings.messageFontSize = size
      await getAppKeyValueStorage().setItem(STORAGE_KEYS.USER_SETTINGS, JSON.stringify(settings))
    } catch (error) {
      console.error('Failed to save message font size:', error)
    }
  },

  setChatBackground: async (bg) => {
    set({ chatBackground: bg })

    try {
      const settingsStr = await getAppKeyValueStorage().getItem(STORAGE_KEYS.USER_SETTINGS)
      const settings = settingsStr ? JSON.parse(settingsStr) : {}
      settings.chatBackground = bg
      await getAppKeyValueStorage().setItem(STORAGE_KEYS.USER_SETTINGS, JSON.stringify(settings))
    } catch (error) {
      console.error('Failed to save chat background:', error)
    }
  },

  setPreferredFiatCurrency: async (code) => {
    const preferredFiatCurrency = normalizeFiatCurrency(code)
    set({ preferredFiatCurrency })

    try {
      const settingsStr = await getAppKeyValueStorage().getItem(STORAGE_KEYS.USER_SETTINGS)
      const settings = settingsStr ? JSON.parse(settingsStr) : {}
      settings.preferredFiatCurrency = preferredFiatCurrency
      await getAppKeyValueStorage().setItem(STORAGE_KEYS.USER_SETTINGS, JSON.stringify(settings))
    } catch (error) {
      console.error('Failed to save fiat currency:', error)
    }
  },

  setTheme: async (isDark) => {
    set({ isDarkMode: isDark })

    try {
      await getAppKeyValueStorage().setItem(STORAGE_KEYS.THEME, isDark ? 'dark' : 'light')
    } catch (error) {
      console.error('Failed to save theme:', error)
    }
  },

  setAppLanguageChoice: async (lang) => {
    const startedAt = Date.now()
    set({ appLanguage: lang, languageChosen: true })
    logLanguageLatency('change.started', { language: lang })

    const changeLanguageStartedAt = Date.now()
    await setAppLanguage(lang)
    const changeLanguageMs = Date.now() - changeLanguageStartedAt

    logLanguageLatency('change.applied', {
      language: lang,
      changeLanguageMs,
      totalMs: Date.now() - startedAt,
    })

    const persistenceVersion = ++languagePersistenceVersion
    const idleScheduledAt = Date.now()
    InteractionManager.runAfterInteractions(() => {
      if (persistenceVersion !== languagePersistenceVersion) {
        return
      }

      const interactionsMs = Date.now() - idleScheduledAt
      logLanguageLatency('ui.idle', {
        language: lang,
        waitForIdleMs: interactionsMs,
        totalMs: Date.now() - startedAt,
      })

      const persistStartedAt = Date.now()
      void getAppKeyValueStorage().setItem(STORAGE_KEYS.APP_LANGUAGE, lang)
        .then(() => {
          logLanguageLatency('persist.completed', {
            language: lang,
            persistMs: Date.now() - persistStartedAt,
            totalMs: Date.now() - startedAt,
          })
        })
        .catch((error) => {
          console.error('Failed to save app language:', error)
        })
    })
  },

  loadSettings: async () => {
    try {
      const [settingsStr, theme, storedLanguage] = await Promise.all([
        getAppKeyValueStorage().getItem(STORAGE_KEYS.USER_SETTINGS),
        getAppKeyValueStorage().getItem(STORAGE_KEYS.THEME),
        getAppKeyValueStorage().getItem(STORAGE_KEYS.APP_LANGUAGE),
      ])

      if (settingsStr) {
        const settings = JSON.parse(settingsStr)
        if (settings.messageFontSize && MESSAGE_FONT_SIZES[settings.messageFontSize as MessageFontSize]) {
          set({ messageFontSize: settings.messageFontSize })
        }
        if (settings.chatBackground) {
          set({ chatBackground: settings.chatBackground })
        }
        if (settings.preferredFiatCurrency) {
          set({ preferredFiatCurrency: normalizeFiatCurrency(settings.preferredFiatCurrency) })
        }
      }

      if (theme === 'light') {
        set({ isDarkMode: false })
      } else {
        set({ isDarkMode: true })
      }

      if (isAppLanguage(storedLanguage)) {
        set({ appLanguage: storedLanguage, languageChosen: true })
        await setAppLanguage(storedLanguage)
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  },
}))

export const toast = {
  success: (title: string, message?: string) =>
    useUIStore.getState().showToast({ type: 'success', title, message }),
  
  error: (title: string, message?: string) =>
    useUIStore.getState().showToast({ type: 'error', title, message }),
  
  warning: (title: string, message?: string) =>
    useUIStore.getState().showToast({ type: 'warning', title, message }),
  
  info: (title: string, message?: string) =>
    useUIStore.getState().showToast({ type: 'info', title, message }),
}
