import type { Payload } from 'payload'
import { POPPY_COLLECTION } from '../constants'

export const ensurePoppyIndexes = async (payload: Payload): Promise<void> => {
  // Payload collection indexes do not expose TTL options. Cleanup is the only Mongo-specific operation.
  await payload.db.collections[POPPY_COLLECTION].collection.createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 },
  )
}
