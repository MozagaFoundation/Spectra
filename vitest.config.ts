/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./test/setupExpoModules.ts'],
  },
  resolve: {
    alias: {
      '@spectra/core-crypto': path.resolve(__dirname, 'packages/spectra-core-crypto/src'),
      '@spectra/identity-vault': path.resolve(__dirname, 'packages/spectra-identity-vault/src'),
      '@spectra/privacy-protocol': path.resolve(__dirname, 'packages/spectra-privacy-protocol/src'),
      '@spectra/public-content': path.resolve(__dirname, 'packages/spectra-public-content/src'),
      '@testing-library/react-native': path.resolve(__dirname, 'test/testing-library-react-native.ts'),
      '@react-native-community/netinfo': path.resolve(__dirname, 'test/react-native-netinfo.ts'),
      '@react-native-community/netinfo/lib/commonjs/index.ts': path.resolve(__dirname, 'test/react-native-netinfo.ts'),
      '@react-native-community/netinfo/lib/module/index.js': path.resolve(__dirname, 'test/react-native-netinfo.ts'),
      '@/assets/images/logos/mozaga-color.png': path.resolve(__dirname, 'test/imageAsset.ts'),
      'react-native-nitro-tor': path.resolve(__dirname, 'test/react-native-nitro-tor.ts'),
      'react-native-gesture-handler': path.resolve(__dirname, 'test/react-native-gesture-handler.ts'),
      'react-native': path.resolve(__dirname, 'test/react-native.ts'),
      '@': path.resolve(__dirname, '.'),
    },
  },
})
