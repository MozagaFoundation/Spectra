/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/** Module boundary rules for eslint-plugin-boundaries. */

module.exports = {
  plugins: ['boundaries'],
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: `${__dirname}/tsconfig.json`,
      },
    },
    'boundaries/elements': [
      { type: 'coreCryptoPackage', pattern: 'packages/spectra-core-crypto/src/**/*' },
      { type: 'identityVaultPackage', pattern: 'packages/spectra-identity-vault/src/**/*' },
      { type: 'privacyProtocolPackage', pattern: 'packages/spectra-privacy-protocol/src/**/*' },
      { type: 'publicContentPackage', pattern: 'packages/spectra-public-content/src/**/*' },
      { type: 'lib', pattern: 'lib/**/*' },
      { type: 'store', pattern: 'store/**/*' },
      { type: 'shared', pattern: 'services/shared/**/*' },
      { type: 'backend', pattern: 'services/backend/**/*' },
      { type: 'tor', pattern: 'services/tor/**/*' },
      { type: 'storage', pattern: 'services/storage/**/*' },
      { type: 'wallet', pattern: 'services/wallet/**/*' },
      { type: 'cryptoService', pattern: 'services/crypto/**/*' },
      { type: 'accountLifecycle', pattern: 'services/accountLifecycle/**/*' },
      { type: 'security', pattern: 'services/security/**/*' },
      { type: 'notifications', pattern: 'services/notifications/**/*' },
      { type: 'bluetooth', pattern: 'services/bluetooth/**/*' },
      { type: 'ui', pattern: ['app/**/*', 'components/**/*'] },
      {
        type: 'quantumChat',
        pattern: 'services/quantumChat/**/*',
      },
      {
        type: 'groupChat',
        pattern: 'services/groupChat/**/*',
      },
      {
        type: 'chat',
        category: 'feature',
        pattern: 'services/chat/**/*',
      },
      {
        type: 'call',
        category: 'feature',
        pattern: 'services/call/**/*',
      },
      {
        type: 'media',
        category: 'feature',
        pattern: 'services/media/**/*',
      },
      {
        type: 'agora',
        category: 'feature',
        pattern: 'services/agora/**/*',
      },
    ],
    'boundaries/ignore': [
      '**/node_modules/**',
      '.expo/**',
      'android/**',
      'ios/**',
      'dist/**',
    ],
  },
  rules: {
    // Block direct imports between isolated feature services.
    'boundaries/dependencies': [
      'error',
      {
        default: 'allow',
        message:
          '{{from.type}} must not depend on {{to.type}} (cross-feature isolation). Use lib/ (e.g. eventBus), store/, services/shared/, or infrastructure modules (backend, tor, storage).',
        rules: [
          {
            allow: {
              dependency: { relationship: { to: 'internal' } },
            },
          },
          {
            from: {
              type: [
                'coreCryptoPackage',
                'identityVaultPackage',
                'privacyProtocolPackage',
                'publicContentPackage',
              ],
            },
            disallow: {
              to: {
                type: [
                  'lib',
                  'store',
                  'shared',
                  'backend',
                  'tor',
                  'storage',
                  'wallet',
                  'cryptoService',
                  'security',
                  'notifications',
                  'bluetooth',
                  'ui',
                  'quantumChat',
                  'groupChat',
                  'chat',
                  'call',
                  'media',
                  'agora',
                ],
              },
            },
            message:
              '{{from.type}} must stay technically separable from app/product modules. Move pure protocol code into the package instead of importing {{to.type}}.',
          },
          {
            from: { type: 'ui' },
            allow: { to: { type: '*' } },
          },
          {
            from: { type: 'accountLifecycle' },
            allow: { to: { type: '*' } },
          },
          {
            allow: {
              to: {
                type: [
                  'lib',
                  'store',
                  'shared',
                  'backend',
                  'tor',
                  'storage',
                ],
              },
            },
          },
          {
            from: { type: 'quantumChat' },
            allow: { to: { type: ['media', 'groupChat'] } },
          },
          {
            from: { type: 'chat' },
            disallow: { to: { type: 'call' } },
          },
          {
            from: { type: 'call' },
            disallow: { to: { type: 'chat' } },
          },
          {
            from: { type: 'media' },
            disallow: { to: { type: 'call' } },
          },
          {
            from: { type: 'agora' },
            disallow: {
              to: {
                type: ['chat', 'call', 'media', 'quantumChat', 'groupChat', 'bluetooth'],
              },
            },
          },
          {
            from: { type: ['chat', 'call', 'media', 'quantumChat', 'groupChat'] },
            disallow: { to: { type: 'agora' } },
          },
        ],
      },
    ],
  },
};
