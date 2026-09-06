import type { Principal } from './auth.ts'
import { scheduleCallSignalWakeups } from './callRealtime.ts'
import { type Database, db } from './db.ts'
import { HttpError, isRecord, randomToken } from './http.ts'

const policies = {
  user_settings: { actions: 'select,insert,upsert,update,delete', read: 'owner' },
  notification_tokens: { actions: 'select,insert,upsert,update,delete', read: 'owner' },
  notification_token_registrations: {
    actions: 'select,insert,upsert,update,delete',
    read: 'owner',
  },
  call_sessions: { actions: 'select,insert,update', read: 'call' },
  call_signals: { actions: 'select,insert,update', read: 'call' },
  chat_groups: { actions: 'select,insert,update,delete', read: 'group' },
  chat_group_members: { actions: 'select,insert,upsert,update', read: 'group' },
  chat_group_messages: { actions: 'select,insert', read: 'group' },
  chat_media: { actions: 'select,insert,upsert,update,delete', read: 'media' },
  messages: { actions: 'select,insert,upsert,update,delete', read: 'owner' },
} as const

type TableName = keyof typeof policies
type CallLifecycleState =
  | 'initiating'
  | 'ringing'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'ended'
  | 'failed'
const validColumn = /^[A-Za-z][A-Za-z0-9_]{0,96}$/
const numericFilters = new Set([
  'call_signals:sequence_number',
  'chat_group_messages:server_sequence',
  'chat_group_messages:key_version',
  'chat_group_messages:group_revision',
])
const immutableUpdateFields = new Set([
  'id',
  'identityId',
  'walletAddress',
  'user_id',
  'wallet_address',
  'notification_scope_id',
  'caller_identity_id',
  'callee_identity_id',
  'sender_identity_id',
  'recipient_identity_id',
  'call_session_id',
  'conversation_id',
  'owner_user_id',
])

interface Filter {
  op: string
  column: string
  value: unknown
}

export async function tableRequest(
  principal: Principal,
  request: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (typeof request.table !== 'string' || !(request.table in policies)) {
    throw new HttpError(403, 'forbidden')
  }
  const table = request.table as TableName
  const action = typeof request.action === 'string' && request.action.trim()
    ? request.action.trim()
    : 'select'
  if (!['select', 'insert', 'upsert', 'update', 'delete'].includes(action)) {
    throw new HttpError(400, 'invalid_request')
  }
  if (!policies[table].actions.split(',').includes(action)) {
    throw new HttpError(403, 'forbidden')
  }
  if (
    !principal.identityId &&
    ['call', 'group', 'media'].includes(policies[table].read)
  ) {
    throw new HttpError(403, 'identity_binding_required')
  }
  if (
    ['chat_groups', 'chat_group_members', 'chat_group_messages'].includes(table) &&
    action !== 'select'
  ) throw new HttpError(426, 'upgrade_required')
  switch (action) {
    case 'select':
      return await selectRows(principal, table, request)
    case 'insert':
      return await insertRows(principal, table, request.payload, false, undefined)
    case 'upsert': {
      let payload = request.payload
      let onConflict: string | undefined
      if (isRecord(payload) && 'rows' in payload) {
        if (isRecord(payload.options) && typeof payload.options.onConflict === 'string') {
          onConflict = payload.options.onConflict
        }
        payload = payload.rows
      }
      if (
        !onConflict && isRecord(request.options) && typeof request.options.onConflict === 'string'
      ) {
        onConflict = request.options.onConflict
      }
      return await insertRows(principal, table, payload, true, onConflict)
    }
    case 'update':
      return await updateRows(principal, table, request)
    case 'delete':
      return await deleteRows(principal, table, request)
    default:
      throw new HttpError(400, 'invalid_request')
  }
}

async function selectRows(
  principal: Principal,
  table: TableName,
  request: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const filters = parseFilters(request.filters)
  const { where, args } = whereClause(table, filters)
  const access = readAccess(table, policies[table].read, principal.userId, args.length + 1)
  if (access.argument) args.push(access.argument)
  const selection = 'records.body'
  let query =
    `select ${selection} as body from mobile_app_records records ${where} and ${access.sql}`
  if (Array.isArray(request.orderBy) && request.orderBy.length > 0) {
    const order = request.orderBy[0]
    if (
      !isRecord(order) || typeof order.column !== 'string' || !validColumn.test(order.column)
    ) {
      throw new HttpError(400, 'invalid_request')
    }
    query += ` order by ${columnExpression(table, order.column)} ${
      order.ascending === true ? 'asc' : 'desc'
    }`
  }
  if (request.limit !== null && request.limit !== undefined) {
    if (!Number.isSafeInteger(request.limit) || (request.limit as number) < 1) {
      throw new HttpError(400, 'invalid_request')
    }
    query += ` limit ${Math.min(request.limit as number, 1000)}`
  } else query += ' limit 1000'
  const rows = await db().unsafe<{ body: Record<string, unknown> }[]>(query, args)
  const data = rows.map((row) => row.body)
  const mode = request.mode
  return {
    data: mode === 'single' || mode === 'maybeSingle' ? data[0] ?? null : data,
    count: data.length,
  }
}

function parseFilters(value: unknown): Filter[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > 50) throw new HttpError(400, 'invalid_request')
  return value.map((entry) => {
    if (
      !isRecord(entry) || typeof entry.op !== 'string' || typeof entry.column !== 'string' ||
      !validColumn.test(entry.column)
    ) throw new HttpError(400, 'invalid_request')
    if (!['', 'eq', 'neq', 'lt', 'gt', 'lte', 'gte', 'is', 'in'].includes(entry.op)) {
      throw new HttpError(400, 'invalid_request')
    }
    if (entry.op === 'in' && (!Array.isArray(entry.value) || entry.value.length > 100)) {
      throw new HttpError(400, 'invalid_request')
    }
    return { op: entry.op, column: entry.column, value: entry.value }
  })
}

function whereClause(table: TableName, filters: Filter[]): { where: string; args: unknown[] } {
  const args: unknown[] = [table]
  const clauses = ['records.record_table = $1']
  for (const filter of filters) {
    const expression = columnExpression(table, filter.column)
    switch (filter.op) {
      case '':
      case 'eq':
        args.push(String(filter.value))
        clauses.push(`${expression} = $${args.length}`)
        break
      case 'neq':
        args.push(String(filter.value))
        clauses.push(`${expression} <> $${args.length}`)
        break
      case 'lt':
      case 'gt':
      case 'lte':
      case 'gte': {
        const operator = { lt: '<', gt: '>', lte: '<=', gte: '>=' }[filter.op]
        args.push(String(filter.value))
        clauses.push(
          `${expression} ${operator} $${args.length}${
            numericFilters.has(`${table}:${filter.column}`) ? '::bigint' : ''
          }`,
        )
        break
      }
      case 'is':
        if (filter.value !== null) throw new HttpError(400, 'invalid_request')
        clauses.push(
          `(records.body->'${filter.column}' is null or records.body->'${filter.column}' = 'null'::jsonb)`,
        )
        break
      case 'in': {
        const values = (filter.value as unknown[]).map(String)
        if (values.length === 0) {
          clauses.push('false')
          break
        }
        const positions = values.map((value) => {
          args.push(value)
          return `$${args.length}`
        })
        clauses.push(`${expression} in (${positions.join(',')})`)
        break
      }
    }
  }
  return { where: `where ${clauses.join(' and ')}`, args }
}

function columnExpression(table: TableName, column: string): string {
  const expression = `records.body->>'${column}'`
  return numericFilters.has(`${table}:${column}`) ? `(${expression})::bigint` : expression
}

function readAccess(
  table: TableName,
  access: string,
  userId: string,
  position: number,
): { sql: string; argument?: string } {
  if (access === 'authenticated') return { sql: 'true' }
  const user = `$${position}`
  if (access === 'owner') return { sql: `records.owner_user_id = ${user}`, argument: userId }
  if (access === 'call') {
    const fields = table === 'call_sessions'
      ? "records.body->>'caller_identity_id', records.body->>'callee_identity_id'"
      : "records.body->>'sender_identity_id', records.body->>'recipient_identity_id'"
    return {
      sql:
        `exists (select 1 from auth_wallet_bindings b where b.user_id = ${user} and b.identity_id in (${fields}))`,
      argument: userId,
    }
  }
  if (access === 'group') {
    const group = table === 'chat_groups' ? "records.body->>'id'" : "records.body->>'group_id'"
    const epoch = table === 'chat_group_messages'
      ? "and (records.body->>'key_version')::bigint >= coalesce((m.body->>'joined_epoch')::bigint, 1)"
      : ''
    return {
      sql:
        `exists (select 1 from mobile_app_records m join auth_wallet_bindings b on b.user_id = ${user} and b.identity_id = m.body->>'user_identity_id' where m.record_table = 'chat_group_members' and m.body->>'group_id' = ${group} and coalesce(m.body->>'is_active','false') = 'true' ${epoch})`,
      argument: userId,
    }
  }
  if (access === 'media') {
    return {
      sql:
        `(exists (select 1 from auth_wallet_bindings b where b.user_id = ${user} and b.identity_id in (records.body->>'sender_identity_id', records.body->>'recipient_identity_id')) or exists (select 1 from mobile_app_records m join auth_wallet_bindings b on b.user_id = ${user} and b.identity_id = m.body->>'user_identity_id' where m.record_table='chat_group_members' and m.body->>'group_id'=records.body->>'recipient_identity_id' and coalesce(m.body->>'is_active','false')='true'))`,
      argument: userId,
    }
  }
  throw new HttpError(403, 'forbidden')
}

async function insertRows(
  principal: Principal,
  table: TableName,
  payload: unknown,
  upsert: boolean,
  onConflict?: string,
): Promise<Record<string, unknown>> {
  if (onConflict && (!validColumn.test(onConflict) || onConflict === 'id')) {
    if (onConflict !== 'id') throw new HttpError(400, 'invalid_request')
  }
  const rawRows = Array.isArray(payload) ? payload : [payload]
  if (rawRows.length === 0) return { data: [] }
  if (rawRows.length > 100) throw new HttpError(400, 'invalid_request')
  const rows: {
    row: Record<string, unknown>
    body: string
  }[] = []
  for (const entry of rawRows) {
    if (!isRecord(entry)) throw new HttpError(400, 'invalid_request')
    const row = structuredClone(entry)
    const conflictValue = onConflict ? row[onConflict] : undefined
    if (onConflict && typeof conflictValue !== 'string') throw new HttpError(400, 'invalid_request')
    if (onConflict && row.id !== undefined && row.id !== conflictValue) {
      throw new HttpError(400, 'invalid_request')
    }
    if (typeof row.id !== 'string' || !row.id.trim()) {
      row.id = typeof conflictValue === 'string' ? conflictValue : randomToken(16)
    }
    normalizeCallWrite(table, row)
    const body = JSON.stringify(row)
    if (new TextEncoder().encode(body).byteLength > 256 * 1024) {
      throw new HttpError(413, 'request_too_large')
    }
    rows.push({ row, body })
  }
  await db().begin(async (sql) => {
    for (const prepared of rows) {
      await validateWrite(principal, table, prepared.row, sql)
      if (upsert) {
        const result = await sql`
          insert into mobile_app_records
            (record_table, record_id, body, owner_user_id, created_at, updated_at)
          values (
            ${table}, ${prepared.row.id as string}, ${sql.json(prepared.row)},
            ${principal.userId}, now(), now()
          )
          on conflict (record_table, record_id) do update set
            body = excluded.body, owner_user_id = excluded.owner_user_id,
            updated_at = excluded.updated_at
          where mobile_app_records.owner_user_id = excluded.owner_user_id
            or excluded.record_table = 'user_settings'
          returning record_id
        `
        if (result.length !== 1) throw new HttpError(403, 'forbidden')
      } else {
        await sql`
          insert into mobile_app_records
            (record_table, record_id, body, owner_user_id, created_at, updated_at)
          values (
            ${table}, ${prepared.row.id as string}, ${sql.json(prepared.row)},
            ${principal.userId}, now(), now()
          )
        `
      }
    }
  })
  if (table === 'call_signals') {
    scheduleCallSignalWakeups(rows.map(({ row }) => ({
      callSessionId: row.call_session_id as string,
      recipientIdentityId: row.recipient_identity_id as string,
      signalType: row.signal_type as string,
      sequenceNumber: row.sequence_number as number,
    })))
  }
  const data = rows.map((prepared) => prepared.row)
  return { data: data.length === 1 ? data[0] : data }
}

async function validateWrite(
  principal: Principal,
  table: TableName,
  row: Record<string, unknown>,
  sql: Database = db(),
): Promise<void> {
  const ownIdentity = async (identity: unknown) => {
    if (typeof identity !== 'string') throw new HttpError(400, 'invalid_request')
    const found =
      await sql`select 1 from auth_wallet_bindings where user_id=${principal.userId} and identity_id=${identity}`
    if (found.length === 0) throw new HttpError(403, 'identity_binding_required')
  }
  const ownWallet = async (wallet: unknown, excludeSpectre = false) => {
    if (typeof wallet !== 'string') throw new HttpError(400, 'invalid_request')
    const found = await sql`
      select 1 from auth_wallet_bindings b
      where b.user_id=${principal.userId} and lower(b.wallet_address)=lower(${wallet})
        ${
      excludeSpectre
        ? sql`and not exists (select 1 from mobile_spectre_addresses s where lower(s.wallet_address)=lower(${wallet}))`
        : sql``
    }
    `
    if (found.length === 0) throw new HttpError(403, 'forbidden')
  }
  switch (table) {
    case 'user_settings':
      if (row.id !== row.user_id) throw new HttpError(400, 'invalid_request')
      return await ownWallet(row.user_id)
    case 'notification_tokens':
      if (row.wallet_address !== undefined) {
        if (row.id !== undefined && row.id !== row.wallet_address) {
          throw new HttpError(400, 'invalid_request')
        }
        return await ownWallet(row.wallet_address, true)
      }
      return
    case 'notification_token_registrations': {
      const wallet = row.wallet_address
      if (typeof wallet !== 'string') throw new HttpError(400, 'invalid_request')
      if (
        row.notification_protocol_version !== undefined && row.notification_protocol_version !== 2
      ) {
        throw new HttpError(400, 'invalid_request')
      }
      if (
        row.client_platform !== undefined &&
        row.client_platform !== 'ios' &&
        row.client_platform !== 'android'
      ) {
        throw new HttpError(400, 'invalid_request')
      }
      const scope = row.notification_scope_id
      if (scope === undefined || scope === '') {
        if (typeof row.id !== 'string' || row.id.toLowerCase() !== wallet.toLowerCase()) {
          throw new HttpError(400, 'invalid_request')
        }
      } else if (
        typeof scope !== 'string' || !/^nsc1\.[0-9a-f]{32}$/.test(scope) || row.id !== scope
      ) {
        throw new HttpError(400, 'invalid_request')
      }
      return await ownWallet(wallet, true)
    }
    case 'call_sessions':
      if (
        typeof row.caller_identity_id !== 'string' ||
        typeof row.callee_identity_id !== 'string' ||
        row.caller_identity_id === row.callee_identity_id
      ) throw new HttpError(400, 'invalid_request')
      validateCallSession(row)
      return await ownIdentity(row.caller_identity_id)
    case 'call_signals': {
      if (
        typeof row.sender_identity_id !== 'string' ||
        typeof row.recipient_identity_id !== 'string' ||
        row.sender_identity_id === row.recipient_identity_id ||
        typeof row.call_session_id !== 'string'
      ) throw new HttpError(400, 'invalid_request')
      validateCallSignal(row)
      await ownIdentity(row.sender_identity_id)
      const sessions = await sql<{ body: Record<string, unknown> }[]>`
        select body from mobile_app_records
        where record_table='call_sessions' and record_id=${row.call_session_id}
          and ((body->>'caller_identity_id'=${row.sender_identity_id} and body->>'callee_identity_id'=${row.recipient_identity_id})
            or (body->>'caller_identity_id'=${row.recipient_identity_id} and body->>'callee_identity_id'=${row.sender_identity_id}))
        for update
      `
      if (sessions.length === 0) throw new HttpError(403, 'forbidden')
      if (isTerminalCallState(sessions[0]?.body.state)) {
        throw new HttpError(409, 'call_terminated')
      }
      return
    }
    case 'chat_media': {
      if (
        typeof row.sender_identity_id !== 'string' ||
        typeof row.recipient_identity_id !== 'string' ||
        typeof row.storage_path !== 'string' ||
        row.storage_path.length > 1024 ||
        !row.storage_path.startsWith('spectra://objects/') ||
        typeof row.conversation_id !== 'string' ||
        row.conversation_id.length > 256 ||
        row.status !== 'uploaded'
      ) throw new HttpError(400, 'invalid_request')
      await ownIdentity(row.sender_identity_id)
      const attached = await sql`
        update object_records set chat_media_id=${row.id as string},
          chat_id=${row.conversation_id}, updated_at=now()
        where object_ref=${row.storage_path} and owner_user_id=${principal.userId}
          and purpose='chat_media' and lifecycle='active'
          and (retention_expires_at is null or retention_expires_at > now())
          and (chat_media_id is null or chat_media_id=${row.id as string})
          and (chat_id is null or chat_id=${row.conversation_id})
        returning object_ref
      `
      if (!attached[0]) throw new HttpError(403, 'forbidden')
      return
    }
    case 'messages':
      return
    default:
      throw new HttpError(403, 'forbidden')
  }
}

function normalizeCallWrite(table: TableName, row: Record<string, unknown>): void {
  if (table !== 'call_sessions' && table !== 'call_signals') return
  const now = new Date().toISOString()
  row.created_at = now
  row.updated_at = now
  if (table === 'call_sessions') row.state ??= 'initiating'
  if (table === 'call_signals') {
    row.status ??= 'pending'
    row.expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  }
}

function validateCallSession(row: Record<string, unknown>): void {
  if (
    typeof row.conversation_id !== 'string' || !row.conversation_id ||
    row.conversation_id.length > 256 ||
    !['voice', 'video'].includes(row.call_type as string) ||
    row.state !== 'initiating'
  ) throw new HttpError(400, 'invalid_request')
}

function validateCallSignal(row: Record<string, unknown>): void {
  const expiry = typeof row.expires_at === 'string' ? Date.parse(row.expires_at) : NaN
  if (
    !['offer', 'answer', 'ice_candidate', 'hangup', 'busy', 'ringing'].includes(
      row.signal_type as string,
    ) ||
    !Number.isSafeInteger(row.sequence_number) || (row.sequence_number as number) < 0 ||
    row.status !== 'pending' ||
    ['encrypted_payload', 'nonce', 'auth_tag', 'signature'].some((field) =>
      typeof row[field] !== 'string' || !(row[field] as string)
    ) ||
    !Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 10 * 60 * 1000
  ) throw new HttpError(400, 'invalid_request')
}

async function updateRows(
  principal: Principal,
  table: TableName,
  request: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!isRecord(request.payload)) throw new HttpError(400, 'invalid_request')
  const payloadBytes = new TextEncoder().encode(JSON.stringify(request.payload)).byteLength
  if (payloadBytes > 256 * 1024) throw new HttpError(413, 'request_too_large')
  if (Object.keys(request.payload).some((key) => immutableUpdateFields.has(key))) {
    throw new HttpError(400, 'invalid_request')
  }
  if (
    table === 'chat_media' &&
    Object.keys(request.payload).some((key) =>
      !['status', 'storage_path', 'deleted_at', 'updated_at'].includes(key)
    )
  ) throw new HttpError(400, 'invalid_request')
  if (
    table === 'chat_media' &&
    (request.payload.status !== 'deleted' ||
      request.payload.storage_path !== null ||
      typeof request.payload.deleted_at !== 'string' ||
      !Number.isFinite(Date.parse(request.payload.deleted_at)))
  ) throw new HttpError(400, 'invalid_request')
  if (table === 'call_sessions' || table === 'call_signals') {
    const allowed = table === 'call_sessions'
      ? new Set(['state', 'end_reason', 'started_at', 'ended_at', 'duration_ms', 'updated_at'])
      : new Set(['status', 'processed_at', 'updated_at'])
    if (Object.keys(request.payload).some((key) => !allowed.has(key))) {
      throw new HttpError(400, 'invalid_request')
    }
    if (
      table === 'call_sessions' &&
      request.payload.state !== undefined &&
      !['initiating', 'ringing', 'connecting', 'connected', 'reconnecting', 'ended', 'failed']
        .includes(request.payload.state as string)
    ) throw new HttpError(400, 'invalid_request')
    if (
      table === 'call_sessions' &&
      request.payload.end_reason !== undefined &&
      ![
        'completed',
        'declined',
        'busy',
        'timeout',
        'network_error',
        'crypto_error',
        'cancelled',
        'missed',
      ]
        .includes(request.payload.end_reason as string)
    ) throw new HttpError(400, 'invalid_request')
    if (
      table === 'call_sessions' &&
      request.payload.duration_ms !== undefined &&
      (!Number.isSafeInteger(request.payload.duration_ms) ||
        (request.payload.duration_ms as number) < 0)
    ) throw new HttpError(400, 'invalid_request')
    if (
      table === 'call_sessions' &&
      request.payload.end_reason !== undefined &&
      !isTerminalCallState(request.payload.state)
    ) throw new HttpError(400, 'invalid_request')
    if (
      table === 'call_sessions' &&
      request.payload.ended_at !== undefined &&
      !isTerminalCallState(request.payload.state)
    ) throw new HttpError(400, 'invalid_request')
    if (
      table === 'call_sessions' &&
      isTerminalCallState(request.payload.state) &&
      request.payload.end_reason === undefined
    ) throw new HttpError(400, 'invalid_request')
    if (
      table === 'call_signals' && request.payload.status !== undefined &&
      !['processed', 'expired'].includes(request.payload.status as string)
    ) throw new HttpError(400, 'invalid_request')
  }
  if (table === 'call_sessions') {
    return await updateCallSessionRows(principal, request)
  }
  const filters = parseFilters(request.filters)
  const { where, args } = whereClause(table, filters)
  args.push(principal.userId, JSON.stringify(request.payload))
  const access = table === 'call_signals'
    ? `exists (
      select 1 from auth_wallet_bindings bindings
      where bindings.user_id = $${args.length - 1}
        and bindings.identity_id = records.body->>'recipient_identity_id'
    )`
    : `records.owner_user_id = $${args.length - 1}`
  await db().unsafe(
    `update mobile_app_records records set body=body || $${args.length}::jsonb, updated_at=now() ${where} and ${access}`,
    args,
  )
  return await selectRows(principal, table, request)
}

async function updateCallSessionRows(
  principal: Principal,
  request: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const payload = request.payload as Record<string, unknown>
  const filters = parseFilters(request.filters)
  const { where, args } = whereClause('call_sessions', filters)
  const access = readAccess('call_sessions', 'call', principal.userId, args.length + 1)
  if (access.argument) args.push(access.argument)

  await db().begin(async (sql) => {
    const targets = await sql.unsafe<{
      record_id: string
      body: Record<string, unknown>
    }[]>(
      `select records.record_id, records.body from mobile_app_records records ${where} and ${access.sql} for update`,
      args,
    )
    for (const target of targets) {
      const currentState = target.body.state
      if (!isCallState(currentState)) continue
      const requestedState = payload.state
      if (requestedState !== undefined && !isCallState(requestedState)) continue
      if (
        isTerminalCallState(currentState) ||
        (requestedState !== undefined &&
          !isAllowedCallStateTransition(currentState, requestedState))
      ) {
        continue
      }

      const now = new Date().toISOString()
      const patch: Record<string, unknown> = {
        ...payload,
        updated_at: now,
      }
      if (isTerminalCallState(requestedState)) {
        patch.ended_at = now
      }
      await sql`
        update mobile_app_records
        set body = body || ${sql.json(patch)},
            updated_at = now()
        where record_table = 'call_sessions'
          and record_id = ${target.record_id}
      `
    }
  })

  return await selectRows(principal, 'call_sessions', request)
}

function isCallState(value: unknown): value is CallLifecycleState {
  return (
    value === 'initiating' ||
    value === 'ringing' ||
    value === 'connecting' ||
    value === 'connected' ||
    value === 'reconnecting' ||
    value === 'ended' ||
    value === 'failed'
  )
}

function isTerminalCallState(value: unknown): value is 'ended' | 'failed' {
  return value === 'ended' || value === 'failed'
}

function isAllowedCallStateTransition(
  currentState: CallLifecycleState,
  nextState: CallLifecycleState,
): boolean {
  if (isTerminalCallState(nextState)) return true
  if (currentState === nextState) return true
  return (
    (currentState === 'initiating' && (nextState === 'ringing' || nextState === 'connecting')) ||
    (currentState === 'ringing' && nextState === 'connecting') ||
    (currentState === 'connecting' &&
      (nextState === 'connected' || nextState === 'reconnecting')) ||
    (currentState === 'connected' && nextState === 'reconnecting') ||
    (currentState === 'reconnecting' && nextState === 'connected')
  )
}

async function deleteRows(
  principal: Principal,
  table: TableName,
  request: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { where, args } = whereClause(table, parseFilters(request.filters))
  args.push(principal.userId)
  await db().unsafe(
    `delete from mobile_app_records records ${where} and records.owner_user_id=$${args.length}`,
    args,
  )
  return { data: true }
}
