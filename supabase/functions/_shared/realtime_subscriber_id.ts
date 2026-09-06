export const INVALID_SUBSCRIBER_ID_CLOSE_REASON = 'invalid subscriber id'
export const REALTIME_SUBSCRIBER_ID_MAX_LENGTH = 128
export const REALTIME_SUBSCRIBER_ID_PATTERN = /^[^\s:\0]{1,128}$/

export function isValidRealtimeSubscriberId(value: unknown): value is string {
  return typeof value === 'string' && REALTIME_SUBSCRIBER_ID_PATTERN.test(value)
}
