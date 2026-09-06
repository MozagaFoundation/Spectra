import type { Principal } from './auth.ts'
import { type Database, db } from './db.ts'
import { HttpError } from './http.ts'
import { abandonChatMedia } from './media.ts'

const principal: Principal = {
  userId: 'user-1',
  walletAddress: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  identityId: 'sender-1',
  sessionId: 'session-1',
}

Deno.test('media abandon queues deletion and tombstones sender-owned metadata', async () => {
  const queries: string[] = []
  const database = fakeDatabase((query) => {
    queries.push(query)
    if (query.includes('select lifecycle, chat_media_id')) {
      return [{ lifecycle: 'active', chat_media_id: 'media-1' }]
    }
    if (query.includes('select body from mobile_app_records')) {
      return [{
        body: {
          status: 'uploaded',
          storage_path: objectRef,
          sender_identity_id: 'sender-1',
        },
      }]
    }
    if (query.includes('select 1 from auth_wallet_bindings')) return [{}]
    return [{}]
  })

  const result = await abandonChatMedia(principal, 'media-1', objectRef, database)

  if (!result.abandoned) throw new Error('media was not abandoned')
  if (!queries.some((query) => query.includes("set lifecycle='deletion_pending'"))) {
    throw new Error('object deletion was not queued')
  }
  if (
    !queries.some((query) =>
      query.includes("'status', 'abandoned'") && query.includes("'storage_path', null")
    )
  ) {
    throw new Error('chat media authorization was not tombstoned')
  }
})

Deno.test('media abandon rejects a recipient identity', async () => {
  const queries: string[] = []
  const database = fakeDatabase((query) => {
    queries.push(query)
    if (query.includes('select lifecycle, chat_media_id')) {
      return [{ lifecycle: 'active', chat_media_id: 'media-1' }]
    }
    if (query.includes('select body from mobile_app_records')) {
      return [{
        body: {
          status: 'uploaded',
          storage_path: objectRef,
          sender_identity_id: 'different-sender',
        },
      }]
    }
    return []
  })

  await expectHttpError(
    abandonChatMedia(principal, 'media-1', objectRef, database),
    401,
    'unauthorized',
  )
  if (queries.some((query) => query.includes("set lifecycle='deletion_pending'"))) {
    throw new Error('recipient queued sender media deletion')
  }
})

Deno.test('media abandon recovers an object whose metadata insert failed', async () => {
  const queries: string[] = []
  const database = fakeDatabase((query) => {
    queries.push(query)
    if (query.includes('select lifecycle, chat_media_id')) {
      return [{ lifecycle: 'active', chat_media_id: 'media-1' }]
    }
    if (query.includes('select body from mobile_app_records')) return []
    return [{}]
  })

  await abandonChatMedia(principal, 'media-1', objectRef, database)

  if (!queries.some((query) => query.includes("set lifecycle='deletion_pending'"))) {
    throw new Error('orphaned object deletion was not queued')
  }
  if (queries.some((query) => query.includes('update mobile_app_records'))) {
    throw new Error('missing metadata unexpectedly produced a tombstone')
  }
})

const objectRef = 'spectra://objects/users/sender/attachments/media-1.enc'

function fakeDatabase(
  execute: (query: string, values: unknown[]) => unknown[],
): ReturnType<typeof db> {
  const sql = ((
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) =>
    Promise.resolve(
      execute(strings.join('?').replace(/\s+/g, ' ').trim(), values),
    )) as Database
  sql.json = (value: unknown) => value
  sql.unsafe = <T extends readonly (object | undefined)[]>() => Promise.resolve([] as unknown as T)
  return {
    ...sql,
    begin: async <T>(callback: (transaction: Database) => Promise<T>) => await callback(sql),
  } as unknown as ReturnType<typeof db>
}

async function expectHttpError(
  promise: Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  try {
    await promise
  } catch (error) {
    if (error instanceof HttpError && error.status === status && error.code === code) return
    throw error
  }
  throw new Error(`expected ${status} ${code}`)
}
