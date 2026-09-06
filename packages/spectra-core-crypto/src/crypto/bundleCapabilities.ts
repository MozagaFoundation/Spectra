/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { BundleMetadataCapabilities, PublicKeyBundle } from '../types/index'
import { canonicalJsonStringify } from './canonicalJson'
import { signWithDilithium, signWithDilithiumAsync, verifyDilithiumSignature, verifyDilithiumSignatureAsync } from './dilithium'
import { now, stringToBytes } from './utils'

const BUNDLE_CAPABILITIES_PURPOSE = 'Spectra_Bundle_Metadata_Capabilities_v1'

function buildCapabilitiesSignaturePayload(
  bundle: Pick<PublicKeyBundle, 'identityId' | 'identityKey' | 'mlkemIdentityKey' | 'dilithiumKey'>,
  capabilities: BundleMetadataCapabilities,
): Uint8Array {
  return stringToBytes(canonicalJsonStringify({
    purpose: BUNDLE_CAPABILITIES_PURPOSE,
    identityId: bundle.identityId,
    identityKey: bundle.identityKey,
    mlkemIdentityKey: bundle.mlkemIdentityKey,
    dilithiumKey: bundle.dilithiumKey,
    capabilities,
  }))
}

export function buildDefaultBundleMetadataCapabilities(
  publishedAt: number = now(),
): BundleMetadataCapabilities {
  return {
    version: 1,
    mailboxTokens: ['legacy_v1', 'scoped_v2'],
    sealedControl: ['mailbox_scope_v1'],
    publishedAt,
  }
}

export function signBundleMetadataCapabilities(
  bundle: Pick<PublicKeyBundle, 'identityId' | 'identityKey' | 'mlkemIdentityKey' | 'dilithiumKey'>,
  capabilities: BundleMetadataCapabilities,
  dilithiumPrivateKey: string,
): string {
  return signWithDilithium(
    buildCapabilitiesSignaturePayload(bundle, capabilities),
    dilithiumPrivateKey,
  )
}

export function attachBundleMetadataCapabilities(
  bundle: PublicKeyBundle,
  dilithiumPrivateKey: string,
  publishedAt: number = now(),
): PublicKeyBundle {
  const metadataCapabilities = buildDefaultBundleMetadataCapabilities(publishedAt)
  return {
    ...bundle,
    metadataCapabilities,
    capabilitiesSignature: signBundleMetadataCapabilities(
      bundle,
      metadataCapabilities,
      dilithiumPrivateKey,
    ),
  }
}

export async function attachBundleMetadataCapabilitiesAsync(
  bundle: PublicKeyBundle,
  dilithiumPrivateKey: string,
  publishedAt: number = now(),
): Promise<PublicKeyBundle> {
  const metadataCapabilities = buildDefaultBundleMetadataCapabilities(publishedAt)
  return {
    ...bundle,
    metadataCapabilities,
    capabilitiesSignature: await signWithDilithiumAsync(
      buildCapabilitiesSignaturePayload(bundle, metadataCapabilities),
      dilithiumPrivateKey,
    ),
  }
}

export function verifyBundleMetadataCapabilities(bundle: PublicKeyBundle): boolean {
  if (!bundle.metadataCapabilities && !bundle.capabilitiesSignature) {
    return true
  }
  if (!bundle.metadataCapabilities || !bundle.capabilitiesSignature) {
    return false
  }
  if (Object.hasOwn(bundle.metadataCapabilities, 'publicDisplayName')) {
    return false
  }
  if (bundle.metadataCapabilities.version !== 1) {
    return false
  }
  if (
    !Number.isSafeInteger(bundle.metadataCapabilities.publishedAt) ||
    bundle.metadataCapabilities.publishedAt <= 0
  ) return false
  if (!bundle.metadataCapabilities.mailboxTokens.includes('legacy_v1')) {
    return false
  }
  return verifyDilithiumSignature(
    buildCapabilitiesSignaturePayload(bundle, bundle.metadataCapabilities),
    bundle.capabilitiesSignature,
    bundle.dilithiumKey,
  )
}

export async function verifyBundleMetadataCapabilitiesAsync(bundle: PublicKeyBundle): Promise<boolean> {
  if (!bundle.metadataCapabilities && !bundle.capabilitiesSignature) {
    return true
  }
  if (!bundle.metadataCapabilities || !bundle.capabilitiesSignature) {
    return false
  }
  if (Object.hasOwn(bundle.metadataCapabilities, 'publicDisplayName')) {
    return false
  }
  if (bundle.metadataCapabilities.version !== 1) {
    return false
  }
  if (
    !Number.isSafeInteger(bundle.metadataCapabilities.publishedAt) ||
    bundle.metadataCapabilities.publishedAt <= 0
  ) return false
  if (!bundle.metadataCapabilities.mailboxTokens.includes('legacy_v1')) {
    return false
  }
  return verifyDilithiumSignatureAsync(
    buildCapabilitiesSignaturePayload(bundle, bundle.metadataCapabilities),
    bundle.capabilitiesSignature,
    bundle.dilithiumKey,
  )
}

export function bundleSupportsScopedMailbox(bundle: PublicKeyBundle | null | undefined): boolean {
  if (!bundle?.metadataCapabilities || !bundle.capabilitiesSignature) {
    return false
  }
  return verifyBundleMetadataCapabilities(bundle)
    && bundle.metadataCapabilities.mailboxTokens.includes('scoped_v2')
    && bundle.metadataCapabilities.sealedControl.includes('mailbox_scope_v1')
}

export async function bundleSupportsScopedMailboxAsync(bundle: PublicKeyBundle | null | undefined): Promise<boolean> {
  if (!bundle?.metadataCapabilities || !bundle.capabilitiesSignature) {
    return false
  }
  return await verifyBundleMetadataCapabilitiesAsync(bundle)
    && bundle.metadataCapabilities.mailboxTokens.includes('scoped_v2')
    && bundle.metadataCapabilities.sealedControl.includes('mailbox_scope_v1')
}
