import { randomUUID } from 'node:crypto'
import type { PayloadRequest } from 'payload'
import type { Search } from '@/payload-types'
import type { SearchReindexDoc } from '../types'

/** Build privately and publish with MongoDB's atomic same-database collection rename. */
export const replaceSearchIndex = async (req: PayloadRequest, docs: SearchReindexDoc[]) => {
  const connection = req.payload.db.connection
  const current = req.payload.db.collections.search
  const name = `search_rebuild_${randomUUID().replaceAll('-', '')}`
  const schema = current.schema.clone()
  // Lifecycle is explicit: background auto-creation could recreate a stage after cleanup.
  schema.set('autoCreate', false)
  schema.set('autoIndex', false)
  const staging = connection.model<Search>(name, schema, name)
  try {
    await staging.createCollection()
    await staging.createIndexes()
    if (docs.length) {
      await staging.insertMany(
        docs.map((doc) => ({ ...doc, createdAt: new Date(), updatedAt: new Date() })),
      )
    }
    await staging.collection.rename(current.collection.name, { dropTarget: true })
  } finally {
    try {
      await connection.dropCollection(name)
    } catch (error) {
      // A successful rename has already removed the staging namespace.
      if (!(error instanceof Error && 'code' in error && error.code === 26)) {
        throw error
      }
    } finally {
      connection.deleteModel(name)
    }
  }
}
