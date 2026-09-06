/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

const fs = require('fs')
const path = require('path')
const { createRunOncePlugin, withDangerousMod, withInfoPlist } = require('expo/config-plugins')

const TRUST_KIT_POD_DECLARATION = "  pod 'TrustKit', '~> 3.0'"
const TRUST_KIT_POD_BLOCK = `  # Certificate pinning is configured by plugins/withCertificatePinning.js.
${TRUST_KIT_POD_DECLARATION}

`
const PODFILE_INSERTION_ANCHORS = [/^  use_frameworks! .*$/m, /^  use_react_native!\($/m]

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '10.0.2.2'])
const SYSTEM_TRUST_BACKEND_URL =
  'https://zaobpddfzrwbijfzohxs.supabase.co/functions/v1/spectra-api'

const PINNED_HOSTS = {
  'exp.host': [
    'NjTFN+cuVQdG4sSgGP/BynQbh1htjPmmdf5x2X6Boes=',
    'OdSlmQD9NWJh4EbcOHBxkhygPwNSwA9Q91eounfbcoE=',
  ],
}

function validateBackendUrl(urlValue) {
  if (!urlValue) {
    return
  }

  try {
    const parsed = new URL(urlValue)
    const host = parsed.hostname.toLowerCase()
    if (LOCAL_HOSTS.has(host)) {
      return
    }
    if (parsed.href.replace(/\/+$/, '') !== SYSTEM_TRUST_BACKEND_URL) {
      throw new Error('Production backend URL must use the configured Supabase Edge Function')
    }
  } catch {
    throw new Error('Invalid EXPO_PUBLIC_SPECTRA_API_URL')
  }
}

function getPinnedHosts() {
  validateBackendUrl(process.env.EXPO_PUBLIC_SPECTRA_API_URL)
  return Object.keys(PINNED_HOSTS).sort()
}

function buildPinnedDomains() {
  return getPinnedHosts().reduce((domains, host) => {
    domains[host] = {
      TSKDisableDefaultReportUri: true,
      TSKEnforcePinning: true,
      TSKIncludeSubdomains: false,
      TSKPublicKeyHashes: PINNED_HOSTS[host],
    }
    return domains
  }, {})
}

function ensureTrustKitPod(contents) {
  if (contents.includes(TRUST_KIT_POD_DECLARATION)) {
    return contents
  }

  const insertionAnchor = PODFILE_INSERTION_ANCHORS.find((anchor) => anchor.test(contents))
  if (!insertionAnchor) {
    throw new Error('Unable to find a pod insertion point in ios/Podfile for TrustKit injection.')
  }

  return contents.replace(insertionAnchor, `${TRUST_KIT_POD_BLOCK}$&`)
}

const withCertificatePinning = (config) => {
  config = withInfoPlist(config, (plistConfig) => {
    plistConfig.modResults.TSKConfiguration = {
      TSKPinnedDomains: buildPinnedDomains(),
      TSKSwizzleNetworkDelegates: true,
    }

    return plistConfig
  })

  config = withDangerousMod(config, [
    'ios',
    async (iosConfig) => {
      const podfilePath = path.join(iosConfig.modRequest.platformProjectRoot, 'Podfile')
      const podfileContents = await fs.promises.readFile(podfilePath, 'utf8')
      const updatedContents = ensureTrustKitPod(podfileContents)

      if (updatedContents !== podfileContents) {
        await fs.promises.writeFile(podfilePath, updatedContents)
      }

      return iosConfig
    },
  ])

  return config
}

module.exports = createRunOncePlugin(withCertificatePinning, 'with-certificate-pinning', '1.0.0')
