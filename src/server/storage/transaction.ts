import { sql } from '@payloadcms/db-postgres'
import { createLocalReq, type Payload, type PayloadRequest } from 'payload'

export type Transaction = {
  req: PayloadRequest
  lock: (key: string) => Promise<void>
}

export async function withTransaction<T>(
  payload: Payload,
  operation: (transaction: Transaction) => Promise<T>,
  isolationLevel: 'read committed' | 'repeatable read' = 'read committed',
): Promise<T> {
  if (payload.db.name !== 'postgres') throw new Error('Business operations require the Payload PostgreSQL adapter.')
  const transactionID = await payload.db.beginTransaction({ isolationLevel })
  if (transactionID === null) throw new Error('Business operations require PostgreSQL transactions.')
  try {
    const db = payload.db.sessions?.[String(transactionID)]?.db
    if (!db || typeof db !== 'object' || !('execute' in db) || typeof db.execute !== 'function') {
      throw new Error('The Payload PostgreSQL transaction connection is unavailable.')
    }
    const executeMethod = db.execute
    const execute = async (statement: ReturnType<typeof sql>): Promise<unknown> => executeMethod.call(db, statement)
    const req = await createLocalReq({ req: { transactionID } }, payload)
    await execute(sql`SET LOCAL lock_timeout = '5s'`)
    const result = await operation({
      req,
      lock: async (key) => {
        await execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`)
      },
    })
    if (req.transactionID !== transactionID || !payload.db.sessions?.[String(transactionID)]) {
      throw new Error('The business transaction was aborted before commit.')
    }
    await payload.db.commitTransaction(transactionID)
    return result
  } catch (error) {
    if (payload.db.sessions?.[String(transactionID)]) await payload.db.rollbackTransaction(transactionID)
    throw error
  }
}
