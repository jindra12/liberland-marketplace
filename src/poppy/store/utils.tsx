import { createHash, hkdfSync, randomUUID } from 'node:crypto'
import { CompactEncrypt, compactDecrypt } from 'jose'
import { MongoServerError, type Collection, type Filter } from 'mongodb'
import type {
  CompanyStore,
  JsonObject,
  StoredRecord,
  StoreWriteOptions,
} from '@datalayer/personal-agent-protocol/server'
import type { PoppyRecord } from '../types'
import type { Payload } from 'payload'
import { createPoppyConfig } from '../config/utils'
import { POPPY_COLLECTION } from '../constants'

const live = (): Filter<PoppyRecord> => ({
  $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
})

export const createMongoPoppyStore = (
  collection: Collection<PoppyRecord>,
  tenant: string,
  secret: string,
): CompanyStore => {
  const key = new Uint8Array(hkdfSync('sha256', secret, 'nswap-poppy', 'protocol-state-v1', 32))
  const recordId = (kind: string, id: string) =>
    createHash('sha256')
      .update(JSON.stringify([tenant, kind, id]))
      .digest('hex')
  const encode = async (
    kind: string,
    id: string,
    value: JsonObject,
    options?: StoreWriteOptions,
  ): Promise<PoppyRecord> => ({
    _id: recordId(kind, id),
    tenant,
    kind,
    version: randomUUID(),
    value: await new CompactEncrypt(new TextEncoder().encode(JSON.stringify(value)))
      .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', kid: recordId(kind, id) })
      .encrypt(key),
    ...(options?.expiresAt ? { expiresAt: options.expiresAt } : {}),
  })
  const decode = async (record: PoppyRecord): Promise<StoredRecord> => {
    const decrypted = await compactDecrypt(record.value, key, {
      keyManagementAlgorithms: ['dir'],
      contentEncryptionAlgorithms: ['A256GCM'],
    })
    if (decrypted.protectedHeader.kid !== record._id) {
      throw new Error('Poppy state record identity mismatch')
    }
    const value: JsonObject = JSON.parse(new TextDecoder().decode(decrypted.plaintext))
    return {
      value,
      version: record.version,
      ...(record.expiresAt ? { expiresAt: record.expiresAt } : {}),
    }
  }
  return {
    get: async (kind, id) => {
      const record = await collection.findOne({ _id: recordId(kind, id), ...live() })
      return record ? decode(record) : undefined
    },
    put: async (kind, id, value, options) => {
      await collection.replaceOne(
        { _id: recordId(kind, id) },
        await encode(kind, id, value, options),
        { upsert: true },
      )
    },
    create: async (kind, id, value, options) => {
      try {
        await collection.replaceOne(
          { _id: recordId(kind, id), $nor: [live()] },
          await encode(kind, id, value, options),
          { upsert: true },
        )
        return true
      } catch (error) {
        if (error instanceof MongoServerError && error.code === 11000) {
          return false
        }
        throw error
      }
    },
    replace: async (kind, id, version, value, options) => {
      const result = await collection.replaceOne(
        { _id: recordId(kind, id), version, ...live() },
        await encode(kind, id, value, options),
      )
      return result.modifiedCount === 1
    },
    take: async (kind, id) => {
      const record = await collection.findOneAndDelete({ _id: recordId(kind, id), ...live() })
      return record ? (await decode(record)).value : undefined
    },
    delete: async (kind, id) => {
      await collection.deleteOne({ _id: recordId(kind, id) })
    },
    records: async (kind) =>
      Promise.all((await collection.find({ tenant, kind, ...live() }).toArray()).map(decode)),
  }
}

export const ensurePoppyIndexes = async (collection: Collection<PoppyRecord>) => {
  await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  await collection.createIndex({ tenant: 1, kind: 1 })
}

export const openPoppyStore = async (payload: Payload): Promise<CompanyStore> => {
  const database = payload.db.connection.db
  if (!database) {
    throw new Error('The Poppy database is not connected')
  }
  const collection = database.collection<PoppyRecord>(POPPY_COLLECTION)
  await ensurePoppyIndexes(collection)
  return createMongoPoppyStore(collection, createPoppyConfig().base, payload.secret)
}
