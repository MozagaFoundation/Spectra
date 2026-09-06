/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

const NOTIFICATION_SCOPE_ID_PATTERN = /^nsc1\.[0-9a-f]{32}$/;
const NOTIFICATION_EVENT_ID_PATTERN = /^nev1\.[0-9a-f]{32}$/;

export interface SealedMessagePushData {
  notificationScopeId: string;
  notificationEventId: string;
}

export interface SealedMessagePushPayload {
  title: string;
  body: string;
  data: SealedMessagePushData;
}

export interface GenericSealedMessagePushCopy {
  title: string;
  body: string;
}

export interface LegacySealedMessagePushData {
  type: "sealed_direct_message";
}

const DEFAULT_SEALED_MESSAGE_PUSH_COPY: GenericSealedMessagePushCopy = {
  title: "Spectra",
  body: "New encrypted message",
};

export function isNotificationScopeId(value: unknown): value is string {
  return typeof value === "string" && NOTIFICATION_SCOPE_ID_PATTERN.test(value);
}

export function isNotificationEventId(value: unknown): value is string {
  return typeof value === "string" && NOTIFICATION_EVENT_ID_PATTERN.test(value);
}

export function normalizeSealedMessagePushData(
  value: Record<string, unknown> | null | undefined,
): SealedMessagePushData | null {
  if (
    !isNotificationScopeId(value?.notificationScopeId) ||
    !isNotificationEventId(value.notificationEventId)
  ) {
    return null;
  }

  return {
    notificationScopeId: value.notificationScopeId,
    notificationEventId: value.notificationEventId,
  };
}

export function isLegacySealedMessagePushData(
  value: Record<string, unknown> | null | undefined,
): boolean {
  return Boolean(
    value?.type === "sealed_direct_message" &&
    !("notificationScopeId" in value) &&
    !("notificationEventId" in value) &&
    Object.keys(value).every((key) => key === "type"),
  );
}

export function buildSealedMessagePushPayload(
  notificationScopeId: string,
  notificationEventId: string,
  copy: GenericSealedMessagePushCopy = DEFAULT_SEALED_MESSAGE_PUSH_COPY,
): SealedMessagePushPayload {
  const data = normalizeSealedMessagePushData({
    notificationScopeId,
    notificationEventId,
  });
  if (!data) {
    throw new Error("Invalid sealed-message notification identifiers");
  }

  return {
    title: copy.title,
    body: copy.body,
    data,
  };
}
