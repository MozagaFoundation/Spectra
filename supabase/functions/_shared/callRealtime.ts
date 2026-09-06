import { publishWakeup } from './realtime_bus.ts'

const identifierPattern = /^[^\s:\0]{1,256}$/
const signalTypes = new Set([
  'offer',
  'answer',
  'ice_candidate',
  'hangup',
  'busy',
  'ringing',
])

export interface CallSignalWakeup {
  callSessionId: string
  recipientIdentityId: string
  signalType: string
  sequenceNumber: number
}

export function scheduleCallSignalWakeups(signals: CallSignalWakeup[]): void {
  const validSignals = signals.filter(isValidCallSignalWakeup)
  if (validSignals.length === 0) return

  const publish = async () => {
    for (const signal of validSignals) {
      await publishWakeup({
        topic: `call_signals:${signal.callSessionId}`,
        event: 'call_signal_insert',
        payload: {
          recipient_identity_id: signal.recipientIdentityId,
          signal_type: signal.signalType,
          sequence_number: signal.sequenceNumber,
        },
      }).catch(() => undefined)
    }
  }

  const runtime = globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void }
  }
  if (!runtime.EdgeRuntime) return
  runtime.EdgeRuntime.waitUntil(publish())
}

function isValidCallSignalWakeup(value: CallSignalWakeup): boolean {
  return (
    identifierPattern.test(value.callSessionId) &&
    identifierPattern.test(value.recipientIdentityId) &&
    signalTypes.has(value.signalType) &&
    Number.isSafeInteger(value.sequenceNumber) &&
    value.sequenceNumber >= 0
  )
}
