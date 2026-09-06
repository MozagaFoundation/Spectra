/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export async function resolveActiveVerifiedWalletBinding(options: {
  expectedIdentityId: string
  context: string
}): Promise<{
  walletAddress: string
  identityId: string
}> {
  const [{ useAuthStore }, { useWalletStore }, { getCachedIdentityId }] = await Promise.all([
    import('@/store/authStore'),
    import('@/store/walletStore'),
    import('@/lib/identity'),
  ])
  const authState = useAuthStore.getState()
  const wallet = useWalletStore.getState().wallet
  const binding = {
    walletAddress: wallet?.address ?? authState.exoAddress ?? null,
    identityId: getCachedIdentityId(),
  }

  if (!authState.isCloudAuthVerified || !binding.walletAddress) {
    throw new Error(`Verified wallet binding is required before creating a ${options.context}.`)
  }

  if (!authState.isIdentityBound || !binding.identityId) {
    throw new Error(`Verified identity binding is required before creating a ${options.context}.`)
  }

  if (__DEV__ && binding.identityId !== options.expectedIdentityId) {
    console.warn(
      `[${options.context}] Local identity differed from verified binding; using bound identity instead.`,
      { expectedIdentityId: options.expectedIdentityId, boundIdentityId: binding.identityId }
    )
  }

  return {
    walletAddress: binding.walletAddress,
    identityId: binding.identityId,
  }
}
