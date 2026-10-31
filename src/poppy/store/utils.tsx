import { createHash, randomUUID } from 'node:crypto'
import { ValidationError, type Payload, type Where } from 'payload'
import type {
  CompanyStore,
  JsonObject,
  StoredRecord,
  StoreWriteOptions,
} from '@datalayer/personal-agent-protocol/server'
import type { PoppyRecord } from '../types'
import { createPoppyConfig } from '../config/utils'
import { createPoppyEncryption } from '../encryption/utils'
import { POPPY_COLLECTION } from '../constants'

const live = (): Where => ({
  or: [{ expiresAt: { exists: false } }, { expiresAt: { greater_than: new Date().toISOString() } }],
})

export const createPayloadPoppyStore = (
  payload: Payload,
  tenant: string,
  secret = payload.secret,
): CompanyStore => {
  const encryption = createPoppyEncryption(secret)
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
    id: recordId(kind, id),
    tenant,
    kind,
    version: randomUUID(),
    value: await encryption.encrypt(value, recordId(kind, id)),
    expiresAt: options?.expiresAt ? options.expiresAt.toISOString() : null,
  })
  const decode = async (record: PoppyRecord): Promise<StoredRecord> => ({
    value: await encryption.decrypt(record.value, record.id),
    version: record.version,
    ...(record.expiresAt ? { expiresAt: new Date(record.expiresAt) } : {}),
  })
  return {
    get: async (kind, id) => {
      const record = await payload.db.findOne<PoppyRecord>({
        collection: POPPY_COLLECTION,
        where: { and: [{ id: { equals: recordId(kind, id) } }, live()] },
      })
      return record ? decode(record) : undefined
    },
    put: async (kind, id, value, options) => {
      await payload.db.upsert({
        collection: POPPY_COLLECTION,
        where: { id: { equals: recordId(kind, id) } },
        data: { ...(await encode(kind, id, value, options)) },
      })
    },
    create: async (kind, id, value, options) => {
      try {
        await payload.db.upsert({
          collection: POPPY_COLLECTION,
          where: {
            and: [
              { id: { equals: recordId(kind, id) } },
              { expiresAt: { less_than_equal: new Date().toISOString() } },
            ],
          },
          data: { ...(await encode(kind, id, value, options)) },
        })
        return true
      } catch (error) {
        // An existing live ID loses the atomic insert race; other failures must propagate.
        if (
          error instanceof ValidationError &&
          error.data?.collection === POPPY_COLLECTION &&
          error.data.errors.some((field) => field.path === 'id' || field.path === '_id')
        ) {
          return false
        }
        throw error
      }
    },
    replace: async (kind, id, version, value, options) => {
      const record = await payload.db.updateOne({
        collection: POPPY_COLLECTION,
        where: {
          and: [{ id: { equals: recordId(kind, id) }, version: { equals: version } }, live()],
        },
        data: { ...(await encode(kind, id, value, options)) },
      })
      return Boolean(record)
    },
    take: async (kind, id) => {
      // Payload 3's non-generic deleteOne returns Document; use this collection's generated type.
      const record = (await payload.db.deleteOne({
        collection: POPPY_COLLECTION,
        where: { and: [{ id: { equals: recordId(kind, id) } }, live()] },
      })) as PoppyRecord | null
      return record ? (await decode(record)).value : undefined
    },
    delete: async (kind, id) => {
      await payload.db.deleteOne({
        collection: POPPY_COLLECTION,
        where: { id: { equals: recordId(kind, id) } },
        returning: false,
      })
    },
    records: async (kind) => {
      const records = await payload.db.find<PoppyRecord>({
        collection: POPPY_COLLECTION,
        where: { and: [{ tenant: { equals: tenant }, kind: { equals: kind } }, live()] },
        pagination: false,
        limit: 0,
      })
      return Promise.all(records.docs.map(decode))
    },
  }
}

export const openPoppyStore = async (payload: Payload): Promise<CompanyStore> =>
  createPayloadPoppyStore(payload, createPoppyConfig().base)
