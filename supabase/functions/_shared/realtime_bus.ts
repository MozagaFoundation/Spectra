import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import { loadConfig } from './config.ts'
import { isRecord, sha256Hex } from './http.ts'

export interface Wakeup {
  topic: string
  event: string
  payload: Record<string, unknown>
}

type Client = ReturnType<typeof createClient>

interface SharedSubscription {
  topic: string
  channel: RealtimeChannel
  callbacks: Set<(wakeup: Wakeup) => void>
  ready: Promise<void>
}

interface SharedPublisher {
  channel: RealtimeChannel
  ready: Promise<void>
  lastUsedAt: number
  idleTimer?: ReturnType<typeof setTimeout>
}

const subscriptions = new Map<string, SharedSubscription>()
const publishers = new Map<string, SharedPublisher>()
const publishTails = new Map<string, Promise<void>>()
let subscriberClient: Client | undefined
let publisherClient: Client | undefined
let pendingPublishes = 0
const publisherIdleMs = 1_000
const publisherLimit = 64

function client(): Client {
  const config = loadConfig()
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function channelName(topic: string): Promise<string> {
  return `spectra-edge-${(await sha256Hex(topic)).slice(0, 48)}`
}

export async function publishWakeup(wakeup: Wakeup): Promise<void> {
  validateWakeup(wakeup)
  const name = await channelName(wakeup.topic)
  if (pendingPublishes >= 128) throw new Error('realtime publish queue is full')
  pendingPublishes++
  const prior = publishTails.get(name) ?? Promise.resolve()
  const current = prior.catch(() => undefined).then(() => publishOnChannel(name, wakeup))
  publishTails.set(name, current)
  try {
    await current
  } finally {
    pendingPublishes--
    if (publishTails.get(name) === current) publishTails.delete(name)
  }
}

async function publishOnChannel(name: string, wakeup: Wakeup): Promise<void> {
  const supabase = publisherClient ??= client()
  let shared = publishers.get(name)
  if (!shared) {
    if (publishers.size >= publisherLimit) await releaseOldestPublisher()
    const channel = supabase.channel(name, {
      config: { broadcast: { self: false, ack: true }, private: false },
    })
    shared = {
      channel,
      ready: waitForSubscription(channel, 3000),
      lastUsedAt: Date.now(),
    }
    publishers.set(name, shared)
  }
  if (shared.idleTimer) clearTimeout(shared.idleTimer)
  shared.lastUsedAt = Date.now()
  try {
    await shared.ready
    const status = await shared.channel.send({
      type: 'broadcast',
      event: 'wakeup',
      payload: wakeup,
    })
    if (status !== 'ok') throw new Error('realtime publish failed')
  } catch (error) {
    await releasePublisher(name, shared)
    throw error
  }
  shared.idleTimer = setTimeout(() => {
    if (publishers.get(name) !== shared || publishTails.has(name)) return
    void releasePublisher(name, shared)
  }, publisherIdleMs)
}

async function releaseOldestPublisher(): Promise<void> {
  let oldest: [string, SharedPublisher] | undefined
  for (const entry of publishers) {
    if (publishTails.has(entry[0])) continue
    if (!oldest || entry[1].lastUsedAt < oldest[1].lastUsedAt) oldest = entry
  }
  if (!oldest) throw new Error('realtime publisher limit reached')
  await releasePublisher(oldest[0], oldest[1])
}

async function releasePublisher(
  name: string,
  shared: SharedPublisher,
): Promise<void> {
  if (publishers.get(name) !== shared) return
  publishers.delete(name)
  if (shared.idleTimer) clearTimeout(shared.idleTimer)
  await (publisherClient ??= client()).removeChannel(shared.channel)
}

export async function subscribeWakeups(
  topic: string,
  callback: (wakeup: Wakeup) => void,
): Promise<{ close: () => Promise<void> }> {
  if (!topic || new TextEncoder().encode(topic).byteLength > 512) {
    throw new Error('invalid realtime topic')
  }
  const name = await channelName(topic)
  let shared = subscriptions.get(name)
  if (shared && shared.topic !== topic) throw new Error('realtime topic collision')
  if (!shared) {
    if (subscriptions.size >= 256) throw new Error('realtime topic limit reached')
    const supabase = subscriberClient ??= client()
    const callbacks = new Set<(wakeup: Wakeup) => void>()
    const channel = supabase.channel(name, {
      config: { broadcast: { self: false, ack: false }, private: false },
    })
    channel.on('broadcast', { event: 'wakeup' }, ({ payload }) => {
      const wakeup = wakeupFromBroadcast(payload, topic)
      if (!wakeup) return
      for (const listener of [...callbacks]) {
        try {
          listener(wakeup)
        } catch {
          // A failed socket callback must not break fan-out to other subscribers.
        }
      }
    })
    shared = { topic, channel, callbacks, ready: waitForSubscription(channel, 5000) }
    subscriptions.set(name, shared)
  }
  if (shared.callbacks.size >= 256) throw new Error('realtime subscriber limit reached')
  shared.callbacks.add(callback)
  try {
    await shared.ready
  } catch (error) {
    shared.callbacks.delete(callback)
    await releaseSubscription(name, shared)
    throw error
  }
  let closed = false
  return {
    close: async () => {
      if (closed) return
      closed = true
      shared!.callbacks.delete(callback)
      await releaseSubscription(name, shared!)
    },
  }
}

async function releaseSubscription(name: string, shared: SharedSubscription): Promise<void> {
  if (shared.callbacks.size !== 0 || subscriptions.get(name) !== shared) return
  subscriptions.delete(name)
  await (subscriberClient ??= client()).removeChannel(shared.channel)
}

function waitForSubscription(channel: RealtimeChannel, milliseconds: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      error ? reject(error) : resolve()
    }
    const timeout = setTimeout(
      () => finish(new Error('realtime subscribe timeout')),
      milliseconds,
    )
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') finish()
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        finish(new Error('realtime subscribe failed'))
      }
    })
  })
}

function wakeupFromBroadcast(payload: unknown, topic: string): Wakeup | null {
  if (validWakeup(payload, topic)) return payload
  if (!isRecord(payload)) return null
  if (validWakeup(payload.payload, topic)) return payload.payload
  if (validWakeup(payload.wakeup, topic)) return payload.wakeup
  return null
}

function validateWakeup(value: Wakeup): void {
  if (!validWakeup(value, value.topic)) throw new Error('invalid realtime wakeup')
}

function validWakeup(value: unknown, topic: string): value is Wakeup {
  if (
    !isRecord(value) || value.topic !== topic || typeof value.event !== 'string' ||
    !value.event || value.event.length > 128 || !isRecord(value.payload)
  ) return false
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength <= 8 * 1024
  } catch {
    return false
  }
}
