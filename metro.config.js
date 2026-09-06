/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);
const existingBlockList = config.resolver.blockList ?? [];
const defaultResolveRequest = config.resolver.resolveRequest;
const nodeOsShim = path.resolve(__dirname, 'shims/node-os.js');
const denoNodeModules = path.resolve(__dirname, 'node_modules/.deno')
  .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
];

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  '@spectra/core-crypto': path.resolve(__dirname, 'packages/spectra-core-crypto/src'),
  '@spectra/identity-vault': path.resolve(__dirname, 'packages/spectra-identity-vault/src'),
  '@spectra/privacy-protocol': path.resolve(__dirname, 'packages/spectra-privacy-protocol/src'),
  '@spectra/public-content': path.resolve(__dirname, 'packages/spectra-public-content/src'),
};

config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs'];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'node:os') {
    return { type: 'sourceFile', filePath: nodeOsShim };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList) ? existingBlockList : [existingBlockList]),
  /.*\.(?:test|spec)\.[jt]sx?$/,
  new RegExp(`^${denoNodeModules}(?:[/\\\\].*)?$`),
];

module.exports = withNativeWind(config, { input: './global.css' });
