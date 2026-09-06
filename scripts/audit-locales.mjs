/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const resourcesFile = path.join(projectRoot, 'lib', 'i18n', 'resources.ts')
const auditFile = path.join(projectRoot, 'lib', 'i18n', 'localeAudit.ts')
const publicContentRoot = path.join(
  projectRoot,
  'packages',
  'spectra-public-content',
  'src',
)

const cache = new Map()

function resolveModulePath(fromFile, specifier) {
  let basePath
  if (specifier === '@spectra/public-content') {
    basePath = path.join(publicContentRoot, 'index')
  } else if (specifier.startsWith('@spectra/public-content/')) {
    basePath = path.join(
      publicContentRoot,
      specifier.slice('@spectra/public-content/'.length),
    )
  } else if (specifier.startsWith('.')) {
    basePath = path.resolve(path.dirname(fromFile), specifier)
  } else {
    return null
  }

  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.js'),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(`Unable to resolve "${specifier}" from ${fromFile}`)
}

function loadTsModule(filePath) {
  const fullPath = path.resolve(filePath)
  if (cache.has(fullPath)) {
    return cache.get(fullPath).exports
  }

  const source = fs.readFileSync(fullPath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: fullPath,
  }).outputText

  const module = { exports: {} }
  cache.set(fullPath, module)

  function localRequire(specifier) {
    const resolved = resolveModulePath(fullPath, specifier)
    if (resolved) {
      return loadTsModule(resolved)
    }

    return require(specifier)
  }

  const script = new vm.Script(transpiled, { filename: fullPath })
  const context = vm.createContext({
    module,
    exports: module.exports,
    require: localRequire,
    __dirname: path.dirname(fullPath),
    __filename: fullPath,
    console,
    process,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Math,
    JSON,
    Set,
    Map,
    RegExp,
  })

  script.runInContext(context)
  return module.exports
}

function main() {
  const resourcesModule = loadTsModule(resourcesFile)
  const { resources, APP_NAMESPACES: namespaces } = resourcesModule
  const {
    collectLocaleAuditIssues,
    formatLocaleAuditIssue,
  } = loadTsModule(auditFile)
  const issues = collectLocaleAuditIssues(resources, namespaces, projectRoot)

  if (issues.length === 0) {
    console.log('Locale audit passed.')
    return
  }

  console.error(`Locale audit failed with ${issues.length} issue(s):`)
  for (const issue of issues) {
    console.error(`- ${formatLocaleAuditIssue(issue)}`)
  }
  process.exitCode = 1
}

main()
