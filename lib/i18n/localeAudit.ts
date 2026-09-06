/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { featureTranslations } from './locales/featureTranslations'
import { sourceTranslations } from './locales/sourceTranslations'
import { translationOverrides } from './locales/translationOverrides'
import type { AppNamespace, LanguageTranslations } from './schema'

export interface LocaleAuditIssue {
  locale: string
  namespace: string
  key: string
  message: string
}

export interface LocaleDefinition {
  namespace: AppNamespace
  key: string
  value: string
}

export interface SourceKeyUse {
  namespace: AppNamespace
  key: string
  file: string
  line: number
}

type ResourcesLike = Record<string, LanguageTranslations>

const SOURCE_FILE_EXTENSIONS = /\.(ts|tsx)$/u
const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx)$/u
const PLURAL_SUFFIX_PATTERN = /^(.*)_(zero|one|two|few|many|other)$/u
const PLACEHOLDER_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/gu
const BIDI_CONTROL_PATTERN = /[\u202A-\u202E\u2066-\u2069]/u
const ZERO_WIDTH_ARTIFACT_PATTERN = /[\u200B\u200E\u200F\u2060\uFEFF]/u
const SCRIPT_LIKE_PATTERN = /<\s*script|javascript\s*:/iu
const CONTENT_NAMESPACES = new Set<AppNamespace>(['help', 'legal'])
const RAW_CLIENT_TEXT_NUMERIC_FORMAT_PATTERN = /^[+-]?\d+(?:[.,]\d+)*%?$/u
const RAW_CLIENT_TEXT_SYMBOL_PATTERN = /^[\p{P}\p{S}\s]+$/u
const RAW_CLIENT_TEXT_TECHNICAL_IDENTIFIER_PATTERN =
  /^(?=.*(?:\d|[-._/:]))[A-Z][A-Z0-9]*(?:[-._/:][A-Z0-9]+)*(?:\s+\((?:FIPS\s+)?[A-Za-z0-9._/-]+\))?$/u
const RAW_CLIENT_TEXT_FORMAT_SUFFIXES = new Set(['d', 'px'])

/**
 * Product names and stable ticker/file-type labels that must remain verbatim.
 * Keep this deliberately small: ordinary English UI copy belongs in locale
 * resources and must never be added here.
 */
const RAW_CLIENT_TEXT_ALLOWED_LITERALS = new Set([
  'Spectra',
  'Mozaga',
  'Ether',
  'Etherscan',
  'Tor',
  'EXO',
  'ETH',
  'PDF',
])

/**
 * Key-specific exceptions for values that must stay byte-for-byte stable:
 * brands, protocol identifiers, asset symbols, and machine-readable formats.
 * Do not add normal UI copy here; it must be translated or overridden.
 */
const ENGLISH_OVERLAY_INVARIANT_KEYS = new Set<string>([
  // Numeric, account, and filename formats.
  localeCompoundKey('common', '0.0'),
  localeCompoundKey('common', 'EXO00...'),
  localeCompoundKey('auth', '{{count}}/80'),
  localeCompoundKey('profile', '{{count}}/80'),
  localeCompoundKey('markets', '0 (unlimited)'),
  localeCompoundKey('contacts', 'spectra:contact:v1:...'),
  localeCompoundKey('common', 'group-photo'),
  // Product, service, and asset names.
  localeCompoundKey('common', 'Spectra'),
  localeCompoundKey('crypto', 'Mozaga'),
  localeCompoundKey('crypto', 'Ether'),
  localeCompoundKey('crypto', 'Etherscan'),
])

const DEFAULT_SOURCE_EXCLUDED_DIRS = new Set([
  '.expo',
  '.git',
  'android',
  'coverage',
  'dist',
  'ios',
  'node_modules',
])
const TEST_SOURCE_DIR_NAMES = new Set(['__tests__', 'test'])

const SPANISH_LEFTOVER_PATTERNS = [
  {
    label: 'spanish punctuation',
    pattern: /[\u00bf\u00a1]/u,
  },
  {
    label: 'known spanish leftover',
    pattern:
      /Estoy muy bien, \u00a1gracias!|Preg\u00fantame lo que quieras/u,
  },
]

export function formatLocaleAuditIssue(issue: LocaleAuditIssue): string {
  return `${issue.locale}:${issue.namespace}.${issue.key} - ${issue.message}`
}

export function localeToModuleName(locale: string): string {
  return locale.replace(/-([a-z0-9])/giu, (_, character: string) => character.toUpperCase())
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export function extractPlaceholders(value: string): string[] {
  return [...value.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]).sort()
}

function stringLiteralValue(node: ts.Node | undefined): string | null {
  if (
    node &&
    (ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node))
  ) {
    return node.text
  }

  return null
}

function staticStringLiteralValue(node: ts.Node | undefined): string | null {
  let current = node
  if (current && ts.isJsxExpression(current)) {
    current = current.expression
  }

  while (
    current &&
    (ts.isAsExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isTypeAssertionExpression(current))
  ) {
    current = current.expression
  }

  return stringLiteralValue(current)
}

function propertyNameValue(node: ts.PropertyName): string | null {
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isIdentifier(node)
  ) {
    return node.text
  }

  return null
}

function getObjectLiteralStringProperty(node: ts.Node | undefined, propertyName: string): string | null {
  if (!node || !ts.isObjectLiteralExpression(node)) {
    return null
  }

  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue
    }

    const name = propertyNameValue(property.name)
    if (name === propertyName) {
      return stringLiteralValue(property.initializer)
    }
  }

  return null
}

function getUseTranslationNamespace(argument: ts.Expression | undefined): AppNamespace {
  if (!argument) {
    return 'common'
  }

  if (ts.isArrayLiteralExpression(argument)) {
    const firstNamespace = stringLiteralValue(argument.elements[0])
    return (firstNamespace ?? 'common') as AppNamespace
  }

  return (stringLiteralValue(argument) ?? 'common') as AppNamespace
}

function getObjectBindingName(element: ts.BindingElement): string | null {
  const name = element.name.getText()
  if (element.propertyName?.getText() === 't' || (!element.propertyName && name === 't')) {
    return name
  }

  return null
}

function getEnglishBaselineValue(englishEntries: Record<string, string>, key: string): string {
  if (englishEntries[key]) {
    return englishEntries[key]
  }

  const pluralMatch = key.match(PLURAL_SUFFIX_PATTERN)
  if (pluralMatch) {
    const stem = pluralMatch[1]
    for (const candidate of [`${stem}_other`, `${stem}_one`]) {
      if (englishEntries[candidate]) {
        return englishEntries[candidate]
      }
    }
  }

  return key
}

function isAllowedPluralPlaceholderOmission(
  locale: string,
  key: string,
  englishPlaceholders: readonly string[],
  localePlaceholders: readonly string[],
): boolean {
  const pluralMatch = key.match(/_(zero|one|two|few|many|other)$/u)
  if (!pluralMatch) {
    return false
  }

  return (
    locale === 'ar' &&
    pluralMatch[1] === 'two' &&
    englishPlaceholders.length === 1 &&
    englishPlaceholders[0] === 'count' &&
    localePlaceholders.length === 0
  )
}

function hasEnglishSourceKey(resources: ResourcesLike, namespace: AppNamespace, key: string): boolean {
  const english = resources.en
  const namespaceEntries = english[namespace] ?? {}
  const commonEntries = english.common ?? {}

  return (
    key in namespaceEntries ||
    key in commonEntries ||
    `${key}_one` in namespaceEntries ||
    `${key}_other` in namespaceEntries ||
    `${key}_one` in commonEntries ||
    `${key}_other` in commonEntries
  )
}

export function parseLocaleDefinitions(filePath: string): LocaleDefinition[] {
  const source = fs.readFileSync(filePath, 'utf8')
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TS)
  const definitions: LocaleDefinition[] = []

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(sourceFile) === 'Object' &&
      node.expression.name.getText(sourceFile) === 'assign' &&
      node.arguments.length >= 2
    ) {
      const [targetNode, objectNode] = node.arguments
      if (
        ts.isPropertyAccessExpression(targetNode) &&
        ts.isObjectLiteralExpression(objectNode)
      ) {
        const namespace = targetNode.name.getText(sourceFile) as AppNamespace
        for (const property of objectNode.properties) {
          if (!ts.isPropertyAssignment(property)) {
            continue
          }

          const key = propertyNameValue(property.name)
          const value = stringLiteralValue(property.initializer)
          if (key && value !== null) {
            definitions.push({ namespace, key, value })
          }
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return definitions
}

function localeCompoundKey(namespace: AppNamespace, key: string): string {
  return `${namespace}\u0000${key}`
}

function collectEnglishOverlayValues(
  namespaces: readonly AppNamespace[],
): Map<string, Set<string>> {
  const allowedNamespaces = new Set(namespaces)
  const valuesByKey = new Map<string, Set<string>>()

  for (const catalog of [featureTranslations.en, sourceTranslations.en]) {
    for (const [namespace, entries] of Object.entries(catalog) as [
      AppNamespace,
      Record<string, string>,
    ][]) {
      if (!allowedNamespaces.has(namespace) || CONTENT_NAMESPACES.has(namespace)) {
        continue
      }

      for (const [key, value] of Object.entries(entries)) {
        const compoundKey = localeCompoundKey(namespace, key)
        const values = valuesByKey.get(compoundKey) ?? new Set<string>()
        values.add(value)
        valuesByKey.set(compoundKey, values)
      }
    }
  }

  return valuesByKey
}

type ExplicitOverlayValues = Map<string, Set<string>>

function explicitOverlayValueKey(
  namespace: AppNamespace,
  key: string,
  value: string,
): string {
  return `${localeCompoundKey(namespace, key)}\u0000${value}`
}

function namespaceFromVariableType(
  declaration: ts.VariableDeclaration,
  sourceFile: ts.SourceFile,
  namespaces: readonly AppNamespace[],
): AppNamespace | null {
  const typeText = declaration.type?.getText(sourceFile)
  if (!typeText) {
    return null
  }

  return namespaces.find(
    (namespace) =>
      typeText.includes(`'${namespace}'`) || typeText.includes(`"${namespace}"`),
  ) ?? null
}

function namespaceFromVariableName(
  name: string,
  namespaces: readonly AppNamespace[],
): AppNamespace | null {
  const normalizedName = name.toLowerCase()
  return namespaces.find((namespace) => normalizedName.includes(namespace)) ?? null
}

function objectLiteralFromExpression(
  expression: ts.Expression | undefined,
): ts.ObjectLiteralExpression | undefined {
  let current = expression
  while (
    current &&
    (ts.isAsExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isTypeAssertionExpression(current))
  ) {
    current = current.expression
  }

  return current && ts.isObjectLiteralExpression(current) ? current : undefined
}

/**
 * Completed catalogs erase whether a matching non-English value was inherited
 * from English or written deliberately. Read direct catalog literals to retain
 * that provenance; generated completion objects remain subject to the audit.
 */
function collectExplicitOverlayValues(
  filePath: string,
  locales: readonly string[],
  namespaces: readonly AppNamespace[],
): ExplicitOverlayValues {
  const source = fs.readFileSync(filePath, 'utf8')
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TS)
  const localeBySourceName = new Map(
    locales.map((locale) => [localeToModuleName(locale), locale]),
  )
  const knownNamespaces = new Set(namespaces)
  const valuesByLocale = new Map<string, Set<string>>()

  function resolveLocale(name: string | null): string | null {
    if (!name) {
      return null
    }

    return locales.includes(name) ? name : localeBySourceName.get(name) ?? null
  }

  function addValue(locale: string, namespace: AppNamespace, key: string, value: string): void {
    const values = valuesByLocale.get(locale) ?? new Set<string>()
    values.add(explicitOverlayValueKey(namespace, key, value))
    valuesByLocale.set(locale, values)
  }

  function collectObjectValues(
    locale: string,
    objectNode: ts.ObjectLiteralExpression,
    namespace: AppNamespace | null,
  ): void {
    for (const property of objectNode.properties) {
      if (!ts.isPropertyAssignment(property)) {
        continue
      }

      const name = propertyNameValue(property.name)
      if (!name) {
        continue
      }

      if (
        knownNamespaces.has(name as AppNamespace) &&
        ts.isObjectLiteralExpression(property.initializer)
      ) {
        collectObjectValues(locale, property.initializer, name as AppNamespace)
        continue
      }

      const value = stringLiteralValue(property.initializer)
      if (namespace && value !== null) {
        addValue(locale, namespace, name, value)
      }
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const locale = resolveLocale(node.name.text)
      const literalArgument = ts.isCallExpression(node.initializer)
        ? node.initializer.arguments.map(objectLiteralFromExpression).find(Boolean)
        : undefined
      const initializedObject = objectLiteralFromExpression(node.initializer)
      const localeObject = initializedObject ?? literalArgument

      if (locale && locale !== 'en' && localeObject) {
        collectObjectValues(locale, localeObject, null)
      }

      if (initializedObject) {
        const defaultNamespace =
          namespaceFromVariableType(node, sourceFile, namespaces) ??
          namespaceFromVariableName(node.name.text, namespaces)
        for (const property of initializedObject.properties) {
          if (!ts.isPropertyAssignment(property) || !ts.isObjectLiteralExpression(property.initializer)) {
            continue
          }

          const propertyLocale = resolveLocale(propertyNameValue(property.name))
          if (propertyLocale && propertyLocale !== 'en') {
            collectObjectValues(propertyLocale, property.initializer, defaultNamespace)
          }
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return valuesByLocale
}

function hasExplicitOverlayTranslation(
  valuesByCatalog: readonly ExplicitOverlayValues[],
  locale: string,
  namespace: AppNamespace,
  key: string,
  runtimeValue: string,
): boolean {
  const explicitValue = explicitOverlayValueKey(namespace, key, runtimeValue)
  return valuesByCatalog.some((valuesByLocale) => valuesByLocale.get(locale)?.has(explicitValue))
}

function hasExplicitLocaleOverride(
  locale: string,
  namespace: AppNamespace,
  key: string,
  runtimeValue: string,
): boolean {
  return translationOverrides[locale]?.[namespace]?.[key] === runtimeValue
}

/**
 * Finds English completion values that the overlay merge made visible at
 * runtime. The raw locale file is the pre-overlay baseline: if it already
 * owns a key, an identical string is not evidence of an overlay fallback.
 */
export function collectEnglishOverlayFallbackIssues(
  resources: ResourcesLike,
  namespaces: readonly AppNamespace[],
  localeDir: string,
): LocaleAuditIssue[] {
  const englishOverlayValues = collectEnglishOverlayValues(namespaces)
  const explicitOverlayValues = [
    collectExplicitOverlayValues(path.join(localeDir, 'sourceTranslations.ts'), Object.keys(resources), namespaces),
    collectExplicitOverlayValues(path.join(localeDir, 'featureTranslations.ts'), Object.keys(resources), namespaces),
  ]
  const issues: LocaleAuditIssue[] = []

  for (const [locale, localeResources] of Object.entries(resources)) {
    if (locale === 'en') {
      continue
    }

    const baseKeys = new Set(
      parseLocaleDefinitions(path.join(localeDir, `${localeToModuleName(locale)}.ts`)).map(
        ({ namespace, key }) => localeCompoundKey(namespace, key),
      ),
    )

    for (const [compoundKey, englishValues] of englishOverlayValues) {
      if (baseKeys.has(compoundKey) || ENGLISH_OVERLAY_INVARIANT_KEYS.has(compoundKey)) {
        continue
      }

      const [namespace, key] = compoundKey.split('\u0000') as [AppNamespace, string]
      const runtimeValue = localeResources[namespace]?.[key]
      if (
        runtimeValue === undefined ||
        !englishValues.has(runtimeValue) ||
        hasExplicitOverlayTranslation(explicitOverlayValues, locale, namespace, key, runtimeValue) ||
        hasExplicitLocaleOverride(locale, namespace, key, runtimeValue)
      ) {
        continue
      }

      issues.push({
        locale,
        namespace,
        key,
        message: 'untranslated English overlay value',
      })
    }
  }

  return issues
}

export function collectDuplicateConflicts(locale: string, definitions: readonly LocaleDefinition[]): LocaleAuditIssue[] {
  const seen = new Map<string, string[]>()
  for (const definition of definitions) {
    const compoundKey = `${definition.namespace}.${definition.key}`
    seen.set(compoundKey, [...(seen.get(compoundKey) ?? []), definition.value])
  }

  const issues: LocaleAuditIssue[] = []
  for (const [compoundKey, values] of seen.entries()) {
    const distinctValues = [...new Set(values.map(normalizeWhitespace))]
    if (distinctValues.length <= 1) {
      continue
    }

    const [namespace, ...keyParts] = compoundKey.split('.')
    issues.push({
      locale,
      namespace,
      key: keyParts.join('.'),
      message: `conflicting duplicate definitions (${distinctValues.length} variants)`,
    })
  }

  return issues
}

export function collectMissingLocaleIssues(resources: ResourcesLike, namespaces: readonly AppNamespace[]): LocaleAuditIssue[] {
  const english = resources.en
  const issues: LocaleAuditIssue[] = []

  for (const [locale, localeResources] of Object.entries(resources)) {
    if (locale === 'en') {
      continue
    }

    for (const namespace of namespaces) {
      const englishEntries = english[namespace] ?? {}
      const localeEntries = localeResources[namespace] ?? {}

      for (const key of Object.keys(englishEntries)) {
        if (!(key in localeEntries)) {
          issues.push({
            locale,
            namespace,
            key,
            message: 'missing locale entry',
          })
        }
      }
    }
  }

  return issues
}

export function collectPlaceholderIssues(resources: ResourcesLike, namespaces: readonly AppNamespace[]): LocaleAuditIssue[] {
  const english = resources.en
  const issues: LocaleAuditIssue[] = []

  for (const [locale, localeResources] of Object.entries(resources)) {
    if (locale === 'en') {
      continue
    }

    for (const namespace of namespaces) {
      const englishEntries = english[namespace] ?? {}
      const localeEntries = localeResources[namespace] ?? {}

      for (const [key, value] of Object.entries(localeEntries)) {
        const englishBaseline = getEnglishBaselineValue(englishEntries, key)
        const englishPlaceholders = extractPlaceholders(englishBaseline)
        const localePlaceholders = extractPlaceholders(value)

        if (
          !arraysEqual(englishPlaceholders, localePlaceholders) &&
          !isAllowedPluralPlaceholderOmission(locale, key, englishPlaceholders, localePlaceholders)
        ) {
          issues.push({
            locale,
            namespace,
            key,
            message: `placeholder mismatch (${englishPlaceholders.join(', ')} vs ${localePlaceholders.join(', ')})`,
          })
        }
      }
    }
  }

  return issues
}

export function collectMixedLanguageIssues(resources: ResourcesLike, namespaces: readonly AppNamespace[]): LocaleAuditIssue[] {
  const issues: LocaleAuditIssue[] = []

  for (const [locale, localeResources] of Object.entries(resources)) {
    if (locale === 'en' || locale === 'es') {
      continue
    }

    for (const namespace of namespaces) {
      for (const [key, value] of Object.entries(localeResources[namespace] ?? {})) {
        if (/__QVI_VAR_\d+/u.test(value)) {
          issues.push({
            locale,
            namespace,
            key,
            message: 'contains placeholder-mangling token',
          })
        }

        for (const leftover of SPANISH_LEFTOVER_PATTERNS) {
          if (leftover.pattern.test(value)) {
            issues.push({
              locale,
              namespace,
              key,
              message: `contains ${leftover.label}`,
            })
            break
          }
        }
      }
    }
  }

  return issues
}

export function collectSuspiciousCharacterIssues(
  resources: ResourcesLike,
  namespaces: readonly AppNamespace[],
): LocaleAuditIssue[] {
  const issues: LocaleAuditIssue[] = []

  for (const [locale, localeResources] of Object.entries(resources)) {
    for (const namespace of namespaces) {
      for (const [key, value] of Object.entries(localeResources[namespace] ?? {})) {
        if (BIDI_CONTROL_PATTERN.test(value)) {
          issues.push({ locale, namespace, key, message: 'contains bidi control character' })
        }

        if (ZERO_WIDTH_ARTIFACT_PATTERN.test(value)) {
          issues.push({ locale, namespace, key, message: 'contains zero-width formatting artifact' })
        }

        if (SCRIPT_LIKE_PATTERN.test(value)) {
          issues.push({ locale, namespace, key, message: 'contains script-like content' })
        }
      }
    }
  }

  return issues
}

function collectSourceFiles(projectRoot: string): string[] {
  const files: string[] = []

  function walk(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (
          !DEFAULT_SOURCE_EXCLUDED_DIRS.has(entry.name) &&
          !TEST_SOURCE_DIR_NAMES.has(entry.name)
        ) {
          walk(path.join(directory, entry.name))
        }
        continue
      }

      if (
        SOURCE_FILE_EXTENSIONS.test(entry.name) &&
        !TEST_FILE_PATTERN.test(entry.name)
      ) {
        files.push(path.join(directory, entry.name))
      }
    }
  }

  walk(projectRoot)
  return files.sort()
}

function isAllowedRawClientText(value: string): boolean {
  return (
    value.length === 0 ||
    RAW_CLIENT_TEXT_ALLOWED_LITERALS.has(value) ||
    RAW_CLIENT_TEXT_NUMERIC_FORMAT_PATTERN.test(value) ||
    RAW_CLIENT_TEXT_SYMBOL_PATTERN.test(value) ||
    RAW_CLIENT_TEXT_TECHNICAL_IDENTIFIER_PATTERN.test(value)
  )
}

function isAlertCall(expression: ts.LeftHandSideExpression): boolean {
  return (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'Alert' &&
    expression.name.text === 'alert'
  )
}

function isSetErrorCall(expression: ts.LeftHandSideExpression): boolean {
  return (
    (ts.isIdentifier(expression) && expression.text === 'setError') ||
    (ts.isPropertyAccessExpression(expression) && expression.name.text === 'setError')
  )
}

function isToastCall(expression: ts.LeftHandSideExpression): boolean {
  return (
    (ts.isIdentifier(expression) && expression.text === 'toast') ||
    (ts.isPropertyAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'toast')
  )
}

function isReactNativeTextElement(node: ts.Node | undefined, sourceFile: ts.SourceFile): boolean {
  return (
    node !== undefined &&
    ts.isJsxElement(node) &&
    node.openingElement.tagName.getText(sourceFile) === 'Text'
  )
}

/**
 * Unit suffixes may be intentionally adjacent to a dynamic display value, for
 * example <Text>{width}px</Text>. They are not standalone UI copy.
 */
function isAllowedTextFormatSuffix(
  node: ts.Node,
  value: string,
  sourceFile: ts.SourceFile,
): boolean {
  if (!ts.isJsxText(node) || !RAW_CLIENT_TEXT_FORMAT_SUFFIXES.has(value)) {
    return false
  }

  const parent = node.parent
  if (!ts.isJsxElement(parent) || !isReactNativeTextElement(parent, sourceFile)) {
    return false
  }

  const index = parent.children.indexOf(node)
  return [-1, 1].some((offset) => {
    const sibling = parent.children[index + offset]
    return (
      sibling !== undefined &&
      ts.isJsxExpression(sibling) &&
      sibling.expression !== undefined &&
      staticStringLiteralValue(sibling) === null
    )
  })
}

/**
 * Finds direct, static text that is shown to a client without flowing through
 * i18n. This intentionally targets only high-confidence React Native output
 * sites, so translation keys, wrapper props, logs, comments, and dynamic
 * values remain outside its scope.
 */
export function collectRawClientTextIssues(projectRoot: string): LocaleAuditIssue[] {
  const issues: LocaleAuditIssue[] = []

  for (const filePath of collectSourceFiles(projectRoot)) {
    const relativeFile = path.relative(projectRoot, filePath)
    const source = fs.readFileSync(filePath, 'utf8')
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.ES2022,
      true,
      relativeFile.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )

    function addIssue(value: string | null, context: string, node: ts.Node): void {
      const text = value === null ? '' : normalizeWhitespace(value)
      if (isAllowedRawClientText(text) || isAllowedTextFormatSuffix(node, text, sourceFile)) {
        return
      }

      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
      issues.push({
        locale: 'en',
        namespace: 'common',
        key: text,
        message: `untranslated raw client text in ${context} (${relativeFile}:${line + 1})`,
      })
    }

    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node)) {
        if (isAlertCall(node.expression)) {
          addIssue(staticStringLiteralValue(node.arguments[0]), 'Alert.alert title', node.arguments[0] ?? node)
          addIssue(staticStringLiteralValue(node.arguments[1]), 'Alert.alert body', node.arguments[1] ?? node)
        } else if (isSetErrorCall(node.expression)) {
          addIssue(staticStringLiteralValue(node.arguments[0]), 'setError message', node.arguments[0] ?? node)
        } else if (isToastCall(node.expression)) {
          addIssue(staticStringLiteralValue(node.arguments[0]), 'toast title', node.arguments[0] ?? node)
          addIssue(staticStringLiteralValue(node.arguments[1]), 'toast message', node.arguments[1] ?? node)
        }
      } else if (
        ts.isJsxAttribute(node) &&
        (node.name.getText(sourceFile) === 'accessibilityLabel' ||
          node.name.getText(sourceFile) === 'accessibilityHint')
      ) {
        addIssue(
          staticStringLiteralValue(node.initializer),
          node.name.getText(sourceFile),
          node.initializer ?? node,
        )
      } else if (ts.isJsxText(node) && isReactNativeTextElement(node.parent, sourceFile)) {
        addIssue(node.getText(sourceFile), 'Text child', node)
      } else if (ts.isJsxExpression(node) && isReactNativeTextElement(node.parent, sourceFile)) {
        addIssue(staticStringLiteralValue(node), 'Text child', node)
      }

      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }

  return issues
}

export function collectSourceKeyUses(projectRoot: string): SourceKeyUse[] {
  const sourceKeyUses: SourceKeyUse[] = []

  for (const filePath of collectSourceFiles(projectRoot)) {
    const relativeFile = path.relative(projectRoot, filePath)
    const source = fs.readFileSync(filePath, 'utf8')
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.ES2022,
      true,
      relativeFile.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const hookTranslators = new Map<string, AppNamespace>()

    function collectHookTranslators(node: ts.Node): void {
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        ts.isCallExpression(node.initializer) &&
        node.initializer.expression.getText(sourceFile) === 'useTranslation'
      ) {
        const namespace = getUseTranslationNamespace(node.initializer.arguments[0])
        if (ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            const bindingName = getObjectBindingName(element)
            if (bindingName) {
              hookTranslators.set(bindingName, namespace)
            }
          }
        }
      }

      ts.forEachChild(node, collectHookTranslators)
    }

    function addUse(namespace: AppNamespace, key: string, node: ts.Node): void {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
      sourceKeyUses.push({
        namespace,
        key,
        file: relativeFile,
        line: line + 1,
      })
    }

    function collectCalls(node: ts.Node): void {
      if (ts.isCallExpression(node) && node.arguments.length >= 1) {
        const callee = node.expression.getText(sourceFile)
        const key = stringLiteralValue(node.arguments[0])
        let namespace: AppNamespace | null = null

        if (callee === 'translate' || callee === 'translateMessage' || callee === 'i18n.t') {
          namespace = (getObjectLiteralStringProperty(node.arguments[1], 'ns') ?? 'common') as AppNamespace
        } else if (hookTranslators.has(callee)) {
          namespace = (getObjectLiteralStringProperty(node.arguments[1], 'ns') ?? hookTranslators.get(callee)) as AppNamespace
        }

        if (namespace && key) {
          addUse(namespace, key, node)
        }
      }

      ts.forEachChild(node, collectCalls)
    }

    collectHookTranslators(sourceFile)
    collectCalls(sourceFile)
  }

  return sourceKeyUses
}

export function collectSourceKeyIssues(resources: ResourcesLike, projectRoot: string): LocaleAuditIssue[] {
  const issues: LocaleAuditIssue[] = []
  const seen = new Set<string>()

  for (const use of collectSourceKeyUses(projectRoot)) {
    const issueKey = `${use.namespace}\u0000${use.key}`
    if (seen.has(issueKey) || hasEnglishSourceKey(resources, use.namespace, use.key)) {
      continue
    }

    seen.add(issueKey)
    issues.push({
      locale: 'en',
      namespace: use.namespace,
      key: use.key,
      message: `source key missing from ${use.namespace} (${use.file}:${use.line})`,
    })
  }

  return issues
}

export function collectLocaleFileIssues(
  resources: ResourcesLike,
  localeDir: string,
): LocaleAuditIssue[] {
  const issues: LocaleAuditIssue[] = []

  for (const locale of Object.keys(resources)) {
    const fileName = `${localeToModuleName(locale)}.ts`
    issues.push(
      ...collectDuplicateConflicts(locale, parseLocaleDefinitions(path.join(localeDir, fileName))),
    )
  }

  return issues
}

export function collectLocaleAuditIssues(
  resources: ResourcesLike,
  namespaces: readonly AppNamespace[],
  projectRoot: string,
): LocaleAuditIssue[] {
  const localeDir = path.join(projectRoot, 'lib', 'i18n', 'locales')

  return [
    ...collectLocaleFileIssues(resources, localeDir),
    ...collectEnglishOverlayFallbackIssues(resources, namespaces, localeDir),
    ...collectMissingLocaleIssues(resources, namespaces),
    ...collectPlaceholderIssues(resources, namespaces),
    ...collectMixedLanguageIssues(resources, namespaces),
    ...collectSuspiciousCharacterIssues(resources, namespaces),
    ...collectSourceKeyIssues(resources, projectRoot),
    ...collectRawClientTextIssues(projectRoot),
  ]
}
