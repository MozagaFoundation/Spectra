/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, beforeAll } from 'vitest'

import {
  collectDuplicateConflicts,
  collectEnglishOverlayFallbackIssues,
  collectLocaleAuditIssues,
  collectRawClientTextIssues,
  collectSourceKeyIssues,
  collectSuspiciousCharacterIssues,
  formatLocaleAuditIssue,
} from './localeAudit'
import { loadAllLanguageResources, resources } from './resources'
import { APP_NAMESPACES } from './schema'

const projectRoot = path.resolve(process.cwd())
const localeDir = path.join(projectRoot, 'lib', 'i18n', 'locales')

function collectFixtureRawClientTextIssues(source: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spectra-locale-audit-'))
  try {
    fs.writeFileSync(path.join(fixtureRoot, 'fixture.tsx'), source)
    return collectRawClientTextIssues(fixtureRoot)
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
}

describe('locale auditor', () => {
  beforeAll(async () => {
    await loadAllLanguageResources()
  })
  it('formats issues for CLI and auditor reports', () => {
    expect(formatLocaleAuditIssue({
      locale: 'en',
      namespace: 'chat',
      key: 'Missing',
      message: 'source key missing',
    })).toBe('en:chat.Missing - source key missing')
  })

  it('detects duplicate locale definitions that would be overwritten at runtime', () => {
    expect(collectDuplicateConflicts('zz', [
      { namespace: 'common', key: 'Call', value: 'Call' },
      { namespace: 'common', key: 'Call', value: 'Different call' },
    ])).toEqual([
      {
        locale: 'zz',
        namespace: 'common',
        key: 'Call',
        message: 'conflicting duplicate definitions (2 variants)',
      },
    ])
  })

  it('detects suspicious invisible and script-like locale content', () => {
    const auditedResources = {
      en: {
        ...resources.en,
        common: {
          ...resources.en.common,
          suspiciousZeroWidth: 'hidden\u200Bspace',
          suspiciousScript: '<script>alert(1)</script>',
        },
      },
    }

    expect(collectSuspiciousCharacterIssues(auditedResources, APP_NAMESPACES)).toEqual([
      {
        locale: 'en',
        namespace: 'common',
        key: 'suspiciousZeroWidth',
        message: 'contains zero-width formatting artifact',
      },
      {
        locale: 'en',
        namespace: 'common',
        key: 'suspiciousScript',
        message: 'contains script-like content',
      },
    ])
  })

  it('keeps literal translation calls backed by English runtime resources', () => {
    expect(collectSourceKeyIssues(resources, projectRoot)).toEqual([])
  })

  it('detects static raw client text at high-confidence React Native output sites', () => {
    const issues = collectFixtureRawClientTextIssues([
      "import { Alert, Text } from 'react-native'",
      "Alert.alert('Raw alert title', 'Raw alert body')",
      "setError('Raw error')",
      "toast.error('Raw toast title', 'Raw toast body')",
      'const view = <Text accessibilityLabel="Raw label" accessibilityHint={\'Raw hint\'}>Raw text child</Text>',
    ].join('\n'))

    expect(issues).toEqual([
      {
        locale: 'en',
        namespace: 'common',
        key: 'Raw alert title',
        message: 'untranslated raw client text in Alert.alert title (fixture.tsx:2)',
      },
      {
        locale: 'en',
        namespace: 'common',
        key: 'Raw alert body',
        message: 'untranslated raw client text in Alert.alert body (fixture.tsx:2)',
      },
      {
        locale: 'en',
        namespace: 'common',
        key: 'Raw error',
        message: 'untranslated raw client text in setError message (fixture.tsx:3)',
      },
      {
        locale: 'en',
        namespace: 'common',
        key: 'Raw toast title',
        message: 'untranslated raw client text in toast title (fixture.tsx:4)',
      },
      {
        locale: 'en',
        namespace: 'common',
        key: 'Raw toast body',
        message: 'untranslated raw client text in toast message (fixture.tsx:4)',
      },
      {
        locale: 'en',
        namespace: 'common',
        key: 'Raw label',
        message: 'untranslated raw client text in accessibilityLabel (fixture.tsx:5)',
      },
      {
        locale: 'en',
        namespace: 'common',
        key: 'Raw hint',
        message: 'untranslated raw client text in accessibilityHint (fixture.tsx:5)',
      },
      {
        locale: 'en',
        namespace: 'common',
        key: 'Raw text child',
        message: 'untranslated raw client text in Text child (fixture.tsx:5)',
      },
    ])
  })

  it('allows translated, dynamic, wrapper, log, and invariant client text patterns', () => {
    const issues = collectFixtureRawClientTextIssues([
      "import { Text } from 'react-native'",
      "Alert.alert(translate('Translated title'), t('Translated body'))",
      'setError(formatError(error))',
      "toast.error(getToastTitle(), translate('Translated toast message'))",
      "console.error('Raw log')",
      "// Alert.alert('Comment title', 'Comment body')",
      'const wrapper = <Button label="English key" title="English title" />',
      "const view = <><Text accessibilityLabel={translate('Translated label')} accessibilityHint={formatHint(value)}>{t('Translated child')}</Text><Text>Spectra</Text><Text>EXO</Text><Text>PDF</Text><Text>ML-DSA-65 (FIPS 204)</Text><Text>0.15%</Text><Text>·</Text><Text>{days}d</Text><Text>{width}px</Text></>",
    ].join('\n'))

    expect(issues).toEqual([])
  })

  it('detects English source and feature completions exposed by runtime resources', () => {
    const featureKey = 'Snowflake bootstrap privacy notice'
    const sourceKey = 'BIP39 word suggestions'
    const auditedResources = {
      ...resources,
      ar: {
        ...resources.ar,
        common: {
          ...resources.ar.common,
          [featureKey]: resources.en.common[featureKey],
          [sourceKey]: resources.en.common[sourceKey],
        },
      },
    }

    expect(collectEnglishOverlayFallbackIssues(
      auditedResources,
      APP_NAMESPACES,
      localeDir,
    )).toEqual([
      {
        locale: 'ar',
        namespace: 'common',
        key: featureKey,
        message: 'untranslated English overlay value',
      },
      {
        locale: 'ar',
        namespace: 'common',
        key: sourceKey,
        message: 'untranslated English overlay value',
      },
    ])
  })

  it('passes the full locale audit', () => {
    expect(collectEnglishOverlayFallbackIssues(resources, APP_NAMESPACES, localeDir)).toEqual([])
    expect(collectLocaleAuditIssues(resources, APP_NAMESPACES, projectRoot)).toEqual([])
  })

  it('keeps verified CTA and lockout copy regressions fixed', () => {
    expect(resources.ar.auth.Continue).toBe('متابعة')
    expect(resources['zh-Hans'].auth['lockout.remainingAttempts_one']).toBe(
      'PIN 码不正确。临时锁定前还剩 {{count}} 次尝试。',
    )
  })
})
