import pRetry from 'p-retry'
import {
  APIError,
  enforceMaxVersions,
  getDataLoader,
  type DataFromCollectionSlug,
  type PayloadRequest,
  type UpdateOne,
  type Where,
} from 'payload'
import pick from 'lodash/pick.js'
import { operationalFields } from './constants'

type AtomicCollection = 'orders' | 'products' | 'variants' | 'startups'

class ConcurrentUpdate extends APIError {
  constructor() {
    super('The record changed concurrently. Retry this operation.', 409)
  }
}

const matchCurrentValue = (field: string, value: string | number | null | undefined): Where =>
  value === undefined || value === null
    ? { or: [{ [field]: { exists: false } }, { [field]: { equals: null } }] }
    : { [field]: { equals: value } }

/** Operational writes use the canonical document, not an editorial draft snapshot. */
export const updateAtomically = async <T extends AtomicCollection>(args: {
  collection: T
  id: string
  req: PayloadRequest
  update: (
    doc: DataFromCollectionSlug<T>,
  ) =>
    | Partial<DataFromCollectionSlug<T>>
    | null
    | Promise<Partial<DataFromCollectionSlug<T>> | null>
}): Promise<DataFromCollectionSlug<T>> => {
  const write: UpdateOne = args.req.payload.db.updateOne.bind(args.req.payload.db)
  const read = async () => {
    const doc = await args.req.payload.db.findOne<DataFromCollectionSlug<T>>({
      collection: args.collection,
      where: { id: { equals: args.id } },
      req: args.req,
    })
    if (!doc) {
      throw new APIError('The requested record no longer exists.', 404)
    }
    return doc
  }
  const doc = await pRetry(
    async () => {
      const current = await read()
      const data = await args.update(current)
      if (!data) {
        return current
      }
      const operationalUpdatedAt = new Date(
        Math.max(
          Date.now(),
          current.updatedAt ? Date.parse(current.updatedAt) + 1 : 0,
          current.operationalUpdatedAt ? Date.parse(current.operationalUpdatedAt) + 1 : 0,
        ),
      ).toISOString()
      const conditions: Where[] = [
        { id: { equals: args.id } },
        matchCurrentValue('operationalUpdatedAt', current.operationalUpdatedAt),
      ]
      if ('inventory' in data && 'inventory' in current) {
        conditions.push(matchCurrentValue('inventory', current.inventory))
      }
      if (args.collection === 'orders' && 'paymentProofs' in data && 'status' in current) {
        conditions.push(matchCurrentValue('status', current.status))
      }
      const updated: DataFromCollectionSlug<T> | null = await write({
        collection: args.collection,
        where: { and: conditions },
        data: {
          ...data,
          operationalUpdatedAt,
          updatedAt: operationalUpdatedAt,
        },
        req: args.req,
      })
      if (!updated) {
        throw new ConcurrentUpdate()
      }
      // The adapter returns this write's document; rereading could return another writer's changes.
      return updated
    },
    {
      retries: 8,
      minTimeout: 5,
      maxTimeout: 100,
      shouldRetry: (error) => error instanceof ConcurrentUpdate,
    },
  )

  const config = args.req.payload.collections[args.collection].config
  if (config.versions && doc.updatedAt) {
    const {
      docs: [latest],
    } = await args.req.payload.db.findVersions({
      collection: args.collection,
      where: { parent: { equals: args.id } },
      sort: '-updatedAt',
      limit: 1,
      pagination: false,
      req: args.req,
    })
    if (!latest || latest.updatedAt < doc.updatedAt) {
      // Use the write timestamp: a delayed older snapshot must never become the latest version.
      await args.req.payload.db.createVersion({
        autosave: false,
        collectionSlug: args.collection,
        parent: args.id,
        versionData: {
          ...(latest?.version || doc),
          ...pick(doc, operationalFields[args.collection]),
        },
        createdAt: doc.updatedAt,
        updatedAt: doc.updatedAt,
        req: args.req,
      })
      if (config.versions.maxPerDoc > 0) {
        await enforceMaxVersions({
          id: args.id,
          collection: config,
          max: config.versions.maxPerDoc,
          payload: args.req.payload,
          req: args.req,
        })
      }
    }
  }
  args.req.payloadDataLoader = getDataLoader(args.req)
  return doc
}
