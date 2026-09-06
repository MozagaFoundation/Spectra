import { isRecord, sha256Hex } from './http.ts'

const scopePattern = /^nsc1\.[0-9a-f]{32}$/
const eventKeyPattern = /^call_event:[0-9a-f]{64}$/

export interface CallPushNotification {
  eventKey: string
  type: 'call' | 'call_end'
  callSessionId: string
  callerIdentityId: string
  calleeIdentityId: string
  recipientIdentityId: string
  callType: 'voice' | 'video'
  expiresAt: number
}

export async function callPushEventId(eventKey: string, scopeId: string): Promise<string> {
  if (!eventKeyPattern.test(eventKey) || !scopePattern.test(scopeId)) {
    throw new Error('invalid call push event')
  }
  return `nev1.${(await sha256Hex(`call-push-v1\0${eventKey}\0${scopeId}`)).slice(0, 32)}`
}

export async function callPushDispatchKey(
  eventKey: string,
  registrationId: string,
): Promise<string> {
  if (
    !eventKeyPattern.test(eventKey) ||
    registrationId.length < 1 ||
    registrationId.length > 256
  ) {
    throw new Error('invalid call push dispatch')
  }
  return `call:${
    (await sha256Hex(`call-push-dispatch-v1\0${eventKey}\0${registrationId}`)).slice(0, 32)
  }`
}

export function buildCallExpoPushPayload(
  pushToken: string,
  notificationScopeId: string,
  notificationEventId: string,
  notification: CallPushNotification,
): Record<string, unknown> {
  const data = {
    type: notification.type,
    notificationProtocolVersion: 2,
    notificationScopeId,
    notificationEventId,
    callSessionId: notification.callSessionId,
    callType: notification.callType,
  }
  if (notification.type === 'call_end') {
    return {
      to: pushToken,
      channelId: 'calls',
      priority: 'high',
      _contentAvailable: true,
      data,
    }
  }
  return {
    to: pushToken,
    title: 'Spectra',
    body: 'Incoming call',
    sound: 'default',
    channelId: 'calls',
    priority: 'high',
    _contentAvailable: true,
    data,
  }
}

export function classifyExpoPushTickets(
  tickets: unknown[],
  tokens: string[],
): {
  settledTokens: string[]
  invalidTokens: string[]
  retryableFailure: boolean
} {
  if (tickets.length !== tokens.length) {
    throw new Error('call push provider response was incomplete')
  }
  const settledTokens: string[] = []
  const invalidTokens: string[] = []
  let retryableFailure = false
  for (let index = 0; index < tickets.length; index++) {
    const ticket = tickets[index]
    const token = tokens[index]
    if (!token || !isRecord(ticket)) {
      retryableFailure = true
      continue
    }
    if (ticket.status === 'ok') {
      settledTokens.push(token)
      continue
    }
    const errorCode = isRecord(ticket.details) &&
        typeof ticket.details.error === 'string'
      ? ticket.details.error
      : ''
    if (ticket.status === 'error' && errorCode === 'DeviceNotRegistered') {
      settledTokens.push(token)
      invalidTokens.push(token)
      continue
    }
    if (ticket.status === 'error' && errorCode === 'MessageTooBig') {
      settledTokens.push(token)
      continue
    }
    retryableFailure = true
  }
  return { settledTokens, invalidTokens, retryableFailure }
}
