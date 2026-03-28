import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  Payload,
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

async function recalculateItemCount(
  payload: Payload,
  identityId: string,
  req: PayloadRequest,
): Promise<void> {
  const [jobCount, productCount, companyCount, startupCount] = await Promise.all([
    payload
      .count({
        collection: 'jobs',
        where: { companyIdentityId: { equals: identityId }, _status: { equals: 'published' } },
        req,
      })
      .then((res) => res.totalDocs),
    payload
      .count({
        collection: 'products',
        where: { companyIdentityId: { equals: identityId } },
        req,
      })
      .then((res) => res.totalDocs),
    payload
      .count({
        collection: 'companies',
        where: { identity: { equals: identityId } },
        req,
      })
      .then((res) => res.totalDocs),
    payload
      .count({
        collection: 'startups',
        where: { identity: { equals: identityId } },
        req,
      })
      .then((res) => res.totalDocs),
  ])

  await payload.update({
    collection: 'identities',
    id: identityId,
    data: { itemCount: jobCount + productCount + companyCount + startupCount },
    overrideAccess: true,
    req,
  })
}

export function updateIdentityItemCountAfterChange(
  field: IdentityResolver,
): CollectionAfterChangeHook {
  return async ({ doc, previousDoc, req }) => {
    const currentId = toStringID(doc?.[field])
    const previousId = toStringID(previousDoc?.[field])

    const idsToUpdate = new Set<string>()
    if (currentId) idsToUpdate.add(currentId)
    if (previousId && previousId !== currentId) idsToUpdate.add(previousId)

    await Promise.all(
      [...idsToUpdate].map((id) => recalculateItemCount(req.payload, id, req)),
    )

    return doc
  }
}

export function updateIdentityItemCountAfterDelete(
  field: IdentityResolver,
): CollectionAfterDeleteHook {
  return async ({ doc, req }) => {
    const identityId = toStringID(doc?.[field])
    if (identityId) {
      await recalculateItemCount(req.payload, identityId, req)
    }
    return doc
  }
}
