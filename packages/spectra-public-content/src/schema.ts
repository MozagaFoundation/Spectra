/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export const APP_NAMESPACES = [
  'common',
  'navigation',
  'auth',
  'chat',
  'contacts',
  'groups',
  'crypto',
  'markets',
  'settings',
  'profile',
  'tor',
  'errors',
  'permissions',
  'help',
  'legal',
] as const

export type AppNamespace = (typeof APP_NAMESPACES)[number]
export type NamespaceTranslations = Record<string, string>
export type LanguageTranslations = Record<AppNamespace, NamespaceTranslations>

export function createEmptyNamespaces(): LanguageTranslations {
  return Object.fromEntries(
    APP_NAMESPACES.map((namespace) => [namespace, {} as NamespaceTranslations]),
  ) as LanguageTranslations
}
