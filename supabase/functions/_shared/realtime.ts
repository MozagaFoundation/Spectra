import type { Principal } from './auth.ts'
import { db } from './db.ts'
import { HttpError, isRecord } from './http.ts'
import { subscribeWakeups } from './realtime_bus.ts'
import {
  INVALID_SUBSCRIBER_ID_CLOSE_REASON,
  isValidRealtimeSubscriberId,
} from './realtime_subscriber_id.ts'

const mailboxPattern = /^smbx[12]\.[^\s:]{8,250}$/
const deliveryPattern = /^sdv1\.[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/
const safeValue = /^[^\s:\0]{1,128}$/

type Subscription = { close: () => Promise<void> }

export function realtimeResponse(
  request: Request,
  principal: Principal,
): Response {
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    throw new HttpError(400, 'websocket_upgrade_required')
  }
  const { socket, response } = Deno.upgradeWebSocket(request, { idleTimeout: 30 })
  const subscriptions = new Map<string, Subscription>()
  let chain = Promise.resolve()
  let queuedMessages = 0
  let resolveLifetime!: () => void
  const lifetime = new Promise<void>((resolve) => {
    resolveLifetime = resolve
  })
  let closing = false

  const closeAll = async () => {
    if (closing) return
    closing = true
    await chain.catch(() => undefined)
    const pending = [...subscriptions.values()].map((sub) => sub.close().catch(() => undefined))
    subscriptions.clear()
    await Promise.all(pending)
  }

  socket.onmessage = (event) => {
    if (queuedMessages >= 128) {
      socket.close(1008, 'message queue full')
      return
    }
    queuedMessages++
    chain = chain.then(async () => {
      if (socket.readyState !== WebSocket.OPEN) return
      const text = typeof event.data === 'string' ? event.data : ''
      if (!text || new TextEncoder().encode(text).byteLength > 8 * 1024) {
        socket.close(1008, 'invalid subscribe')
        return
      }
      let message: unknown
      try {
        message = JSON.parse(text)
      } catch {
        socket.close(1008, 'invalid subscribe')
        return
      }
      if (
        !isRecord(message) || typeof message.topic !== 'string' ||
        (message.type !== undefined && message.type !== 'subscribe' &&
          message.type !== 'unsubscribe')
      ) {
        socket.close(1008, 'invalid subscribe')
        return
      }
      if (message.type === 'unsubscribe') {
        const existing = subscriptions.get(message.topic)
        subscriptions.delete(message.topic)
        await existing?.close()
        sendSocketMessage(socket, { type: 'unsubscribed', topic: message.topic })
        return
      }
      if (!isValidRealtimeSubscriberId(message.subscriberId)) {
        socket.close(1008, INVALID_SUBSCRIBER_ID_CLOSE_REASON)
        return
      }
      if (subscriptions.has(message.topic)) {
        sendSocketMessage(socket, { type: 'subscribed', topic: message.topic })
        return
      }
      if (subscriptions.size >= 64) {
        sendSocketMessage(socket, {
          type: 'error',
          topic: message.topic,
          code: 'subscription_limit',
        })
        return
      }
      if (!(await authorizeTopic(principal, message.topic))) {
        sendSocketMessage(socket, {
          type: 'error',
          topic: message.topic,
          code: await hasCurrentIdentityBinding(principal)
            ? 'unauthorized_topic'
            : 'identity_binding_required',
        })
        return
      }
      if (closing || socket.readyState !== WebSocket.OPEN) return
      try {
        const subscription = await subscribeWakeups(message.topic, (wakeup) => {
          if (socket.readyState === WebSocket.OPEN) {
            sendSocketMessage(socket, {
              type: 'event',
              topic: wakeup.topic,
              event: wakeup.event,
              payload: wakeup.payload,
            })
          }
        })
        subscriptions.set(message.topic, subscription)
        sendSocketMessage(socket, { type: 'subscribed', topic: message.topic })
      } catch {
        socket.close(1011, 'subscribe failed')
      }
    }).catch(() => socket.close(1011, 'subscribe failed')).finally(() => {
      queuedMessages--
    })
  }
  socket.onclose = () => {
    resolveLifetime()
  }
  socket.onerror = () => {
    socket.close(1011, 'socket error')
    resolveLifetime()
  }
  const edgeRuntime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void }
  }).EdgeRuntime
  const lifetimeTask = lifetime.then(closeAll).catch(() => undefined)
  edgeRuntime?.waitUntil(lifetimeTask)
  return response
}

function sendSocketMessage(socket: WebSocket, value: Record<string, unknown>): void {
  const message = JSON.stringify(value)
  if (
    socket.bufferedAmount > 1024 * 1024 || new TextEncoder().encode(message).byteLength > 16 * 1024
  ) {
    socket.close(1009, 'message too large')
    return
  }
  try {
    socket.send(message)
  } catch {
    socket.close(1011, 'send failed')
  }
}

async function authorizeTopic(principal: Principal, topic: string): Promise<boolean> {
  if (topic.startsWith('sealed_mailbox:')) {
    const token = topic.slice('sealed_mailbox:'.length)
    if (!mailboxPattern.test(token)) return false
    const rows = await db()`
      select 1 from chat_mailbox_token_owners
      where mailbox_token=${token} and user_id=${principal.userId}
    `
    return rows.length > 0
  }
  if (topic.startsWith('sealed_receipt:')) {
    const token = topic.slice('sealed_receipt:'.length)
    if (!deliveryPattern.test(token)) return false
    const rows = await db()`
      select 1 from sealed_relay_messages
      where delivery_token=${token} and sender_user_id=${principal.userId}
    `
    return rows.length > 0
  }
  if (topic.startsWith('chat_groups:')) {
    const group = topic.slice('chat_groups:'.length)
    if (!safeValue.test(group)) return false
    const rows = await db()`
      select 1 from mobile_app_records m
      join auth_wallet_bindings b on b.user_id=${principal.userId}
        and b.identity_id=m.body->>'user_identity_id'
      where m.record_table='chat_group_members'
        and m.body->>'group_id'=${group}
        and coalesce(m.body->>'is_active','false')='true'
    `
    return rows.length > 0
  }
  if (topic.startsWith('call_signals:')) {
    const session = topic.slice('call_signals:'.length)
    if (!safeValue.test(session)) return false
    const rows = await db()`
      select 1 from mobile_app_records s
      join auth_wallet_bindings b on b.user_id=${principal.userId}
        and b.identity_id in (s.body->>'caller_identity_id', s.body->>'callee_identity_id')
      where s.record_table='call_sessions' and s.record_id=${session}
    `
    return rows.length > 0
  }
  return false
}

async function hasCurrentIdentityBinding(principal: Principal): Promise<boolean> {
  if (!principal.identityId) return false
  const rows = await db()`
    select 1 from auth_wallet_bindings
    where user_id=${principal.userId}
      and lower(wallet_address)=lower(${principal.walletAddress})
      and identity_id=${principal.identityId}
  `
  return rows.length > 0
}
