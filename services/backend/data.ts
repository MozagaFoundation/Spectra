/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { backendRequest } from './client'

type QueryFilter = {
  op: 'eq' | 'neq' | 'lt' | 'gt' | 'gte' | 'lte' | 'is' | 'in'
  column: string
  value: unknown
}

type OrderBy = {
  column: string
  ascending: boolean
}

type SelectOptions = {
  count?: 'exact'
  head?: boolean
}

type QueryResponse<T = any> = {
  data: T | null
  error: Error | null
  count?: number | null
}

async function accessToken(): Promise<string> {
  const { getValidBackendAccessToken } = await import('@/services/backend/session')
  const token = await getValidBackendAccessToken()
  if (!token) throw new Error('Backend auth token is required')
  return token
}

async function backendDataRequest<T>(path: string, body: unknown): Promise<T> {
  return backendRequest<T>(path, {
    method: 'POST',
    body,
  }, { accessToken: await accessToken() })
}

export function backendTable(table: string): BackendTableQuery {
  return new BackendTableQuery(table)
}

export const backendData = {
  table: backendTable,
}

class BackendTableQuery implements PromiseLike<QueryResponse> {
  private action: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private selectColumns = '*'
  private selectOptions: SelectOptions = {}
  private filters: QueryFilter[] = []
  private orderBy: OrderBy[] = []
  private rowLimit: number | null = null
  private beforeColumn: string | null = null
  private payload: unknown
  private resultMode: 'many' | 'single' | 'maybeSingle' = 'many'

  constructor(private readonly table: string) {}

  select(columns: string = '*', options: SelectOptions = {}): this {
    this.selectColumns = columns
    this.selectOptions = options
    return this
  }

  insert(payload: unknown): this {
    this.action = 'insert'
    this.payload = payload
    return this
  }

  upsert(payload: unknown, options: Record<string, unknown> = {}): this {
    this.action = 'upsert'
    this.payload = { rows: payload, options }
    return this
  }

  update(payload: unknown): this {
    this.action = 'update'
    this.payload = payload
    return this
  }

  delete(): this {
    this.action = 'delete'
    return this
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ op: 'eq', column, value })
    return this
  }

  neq(column: string, value: unknown): this {
    this.filters.push({ op: 'neq', column, value })
    return this
  }

  lt(column: string, value: unknown): this {
    this.filters.push({ op: 'lt', column, value })
    return this
  }

  gt(column: string, value: unknown): this {
    this.filters.push({ op: 'gt', column, value })
    return this
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ op: 'gte', column, value })
    return this
  }

  lte(column: string, value: unknown): this {
    this.filters.push({ op: 'lte', column, value })
    return this
  }

  is(column: string, value: unknown): this {
    this.filters.push({ op: 'is', column, value })
    return this
  }

  in(column: string, value: unknown[]): this {
    this.filters.push({ op: 'in', column, value })
    return this
  }

  ilike(column: string, value: unknown): this {
    this.filters.push({ op: 'eq', column, value })
    return this
  }

  or(expression: string): this {
    throw new Error(`Backend table OR filters are unsupported: ${expression}`)
  }

  order(column: string, options: { ascending?: boolean } = {}): this {
    this.orderBy.push({ column, ascending: options.ascending !== false })
    return this
  }

  limit(limit: number): this {
    this.rowLimit = limit
    return this
  }

  single(): Promise<QueryResponse> {
    this.resultMode = 'single'
    return this.execute()
  }

  maybeSingle(): Promise<QueryResponse> {
    this.resultMode = 'maybeSingle'
    return this.execute()
  }

  then<TResult1 = QueryResponse, TResult2 = never>(
    onfulfilled?: ((value: QueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<QueryResponse> {
    try {
      const response = await backendDataRequest<{
        data: unknown
        count?: number | null
      }>('/v1/appdata/table', {
        table: this.table,
        action: this.action,
        select: this.selectColumns,
        options: this.selectOptions,
        filters: this.filters,
        orderBy: this.orderBy,
        limit: this.rowLimit,
        payload: this.payload,
        mode: this.resultMode,
      })
      return { data: response.data ?? null, error: null, count: response.count ?? null }
    } catch (error) {
      return { data: null, error: error as Error, count: null }
    }
  }
}
