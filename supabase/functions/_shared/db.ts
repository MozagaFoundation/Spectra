import postgres, { type Sql } from 'postgres'
import { loadConfig } from './config.ts'

let client: Sql | undefined

export interface Database {
  <T extends readonly (object | undefined)[] = Record<string, unknown>[]>(
    template: TemplateStringsArray,
    ...parameters: unknown[]
  ): Promise<T>
  json(value: unknown): unknown
  unsafe<T extends readonly (object | undefined)[] = Record<string, unknown>[]>(
    query: string,
    parameters?: unknown[],
  ): Promise<T>
}

interface FlexibleSql extends Database {
  begin<T>(callback: (sql: Database) => Promise<T>): Promise<T>
}

export function db(): FlexibleSql {
  if (client) return client as unknown as FlexibleSql
  client = postgres(loadConfig().databaseUrl, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 5,
    prepare: false,
    connection: { application_name: 'spectra-edge' },
    transform: { undefined: null },
  })
  return client as unknown as FlexibleSql
}

export async function checkDatabase(): Promise<void> {
  await db()`select 1`
}
