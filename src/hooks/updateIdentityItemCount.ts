import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  PayloadRequest,
} from 'payload'

export type IdentityResolver = 'companyIdentityId' | 'identity'

const toStringID = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id: unknown }).id
    if (typeof id === 'string') return id
    if (typeof id === 'number') return String(id)
  }
  return null
}

type RawCollection = {
  updateOne: (filter: { _id: string }, update: { $set: Record<string, unknown> }) => Promise<unknown>
}

type RawCollectionMap = Record<string, { collection?: RawCollection }>

const recalculateItemCount = async (
  req: PayloadRequest,
  identityId: string,
): Promise<void> => {
  const [jobCount, productCount, companyCount, startupCount] = await Promise.all([
    req.payload
      .count({
        collection: 'jobs',
        where: { companyIdentityId: { equals: identityId }, _status: { equals: 'published' } },
        req,
      })
      .then((res) => res.totalDocs),
    req.payload
      .count({
        collection: 'products',
        where: { companyIdentityId: { equals: identityId } },
        req,
      })
      .then((res) => res.totalDocs),
    req.payload
      .count({
        collection: 'companies',
        where: { identity: { equals: identityId } },
        req,
      })
      .then((res) => res.totalDocs),
    req.payload
      .count({
        collection: 'startups',
        where: { identity: { equals: identityId } },
        req,
      })
      .then((res) => res.totalDocs),
  ])

  const collectionMap = req.payload.db.collections as unknown as RawCollectionMap
  const collection = collectionMap.identities?.collection

  if (!collection) {
    throw new Error('Missing raw collection for "identities".')
  }

  await collection.updateOne(
    {
      _id: identityId,
    },
    {
      $set: {
        itemCount: jobCount + productCount + companyCount + startupCount,
      },
    },
  )
}

export const updateIdentityItemCountAfterChange = (
  field: IdentityResolver,
): CollectionAfterChangeHook => {
  return async ({ doc, previousDoc, req }) => {
    const currentId = toStringID(doc?.[field])
    const previousId = toStringID(previousDoc?.[field])

    const idsToUpdate = new Set<string>()
    if (currentId) idsToUpdate.add(currentId)
    if (previousId && previousId !== currentId) idsToUpdate.add(previousId)

    await Promise.all([...idsToUpdate].map((id) => recalculateItemCount(req, id)))

    return doc
  }
}

export const updateIdentityItemCountAfterDelete = (
  field: IdentityResolver,
): CollectionAfterDeleteHook => {
  return async ({ doc, req }) => {
    const identityId = toStringID(doc?.[field])
    if (identityId) {
      await recalculateItemCount(req, identityId)
    }
    return doc
  }
}
