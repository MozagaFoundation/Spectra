/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { translateMessage } from '@/lib/i18n/messages'

export interface DirectLocalNotificationCopy {
  title: string
  body: string
}

export async function buildDirectLocalNotificationCopy(
  _recipientIdentityId: string | null | undefined,
  _senderIdentityId: string,
): Promise<DirectLocalNotificationCopy> {
  const newMessage = translateMessage('New message')

  return {
    title: 'Spectra',
    body: newMessage,
  }
}

export async function buildGroupLocalNotificationBody(
  _recipientIdentityId: string | null | undefined,
  _senderIdentityId: string,
): Promise<string> {
  return translateMessage('New group message')
}
