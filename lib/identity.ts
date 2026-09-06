/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

let cachedIdentity: { walletAddress: string; identityId: string } | null = null

let localIdentityModulePromise: Promise<typeof import('@spectra/core-crypto/client/identity')> | null = null

async function getLocalIdentityModule() {
  if (!localIdentityModulePromise) {
    localIdentityModulePromise = import('@spectra/core-crypto/client/identity')
  }

  return localIdentityModulePromise
}

export async function getIdentityId(walletAddress: string): Promise<string | null> {
  const localIdentity = await getLocalIdentityModule()
    .then(({ loadIdentityByAddress }) => loadIdentityByAddress(walletAddress))
    .catch(() => null)

  if (localIdentity?.identity.id) {
    cachedIdentity = {
      walletAddress,
      identityId: localIdentity.identity.id,
    }
    return localIdentity.identity.id
  }

  if (cachedIdentity?.walletAddress === walletAddress) {
    return cachedIdentity.identityId
  }

  return null
}

export function getCachedIdentityId(): string | null {
  return cachedIdentity?.identityId ?? null
}

export function clearIdentityCache(): void {
  cachedIdentity = null
}
