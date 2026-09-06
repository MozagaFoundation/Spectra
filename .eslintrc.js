/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

module.exports = {
  root: true,
  ignorePatterns: [
    '**/node_modules/**',
    '.expo/**',
    'android/**',
    'ios/**',
    'dist/**',
  ],
  extends: ['./.eslintrc.boundaries.js'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
};
