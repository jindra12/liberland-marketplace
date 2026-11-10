import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, PayloadRequest } from 'payload'

import { toStringID } from '@/utilities/toStringID'

export type IdentityResolver = 'companyIdentityId' | 'identity'

const recalculateItemCount = async (req: PayloadRequest, identityId: string): Promise<void> => {
  const counts = await Promise.all(([
    { collection: 'jobs', field: 'companyIdentityId' },
    { collection: 'products', field: 'companyIdentityId' },
    { collection: 'companies', field: 'identity' },
    { collection: 'startups', field: 'identity' },
  ] as const).map(({ collection, field }) => req.payload.count({
    collection,
    where: { [field]: { equals: identityId }, _status: { equals: 'published' } },
    req,
  })))

  await req.payload.db.updateOne({
    collection: 'identities', id: identityId, req,
    data: { itemCount: counts.reduce((total, count) => total + count.totalDocs, 0) },
    returning: false,
  })
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
