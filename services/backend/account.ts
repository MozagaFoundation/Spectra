/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { backendRequest, type SpectraBackendOptions } from './client'

export interface DeleteBackendAccountResult {
  postgresRowsDeleted: number
  relayRowsDeleted: number
  objectsDeleted: number
  cleanupPending?: boolean
  status?: AccountDeletionStatus
  stage?: AccountDeletionStage
}

export type AccountDeletionStatus = 'pending' | 'failed' | 'completed'
export type AccountDeletionStage = 'postgres' | 'objects' | 'relay' | 'completed'

export interface AccountDeletionStatusResult {
  status: AccountDeletionStatus
  stage: AccountDeletionStage
}

export async function deleteBackendAccount(
  options: SpectraBackendOptions,
  operationToken?: string,
): Promise<DeleteBackendAccountResult> {
  return backendRequest<DeleteBackendAccountResult>(
    '/v1/account/delete',
    {
      method: 'POST',
      body: {
        confirmation: 'DELETE',
        ...(operationToken ? { operationToken } : {}),
      },
    },
    options,
  )
}

export async function getBackendAccountDeletionStatus(
  operationToken: string,
  options: Pick<SpectraBackendOptions, 'baseUrl'> = {},
): Promise<AccountDeletionStatusResult> {
  return backendRequest<AccountDeletionStatusResult>(
    '/v1/account/delete/status',
    {
      method: 'POST',
      body: { operationToken },
    },
    options,
  )
}
