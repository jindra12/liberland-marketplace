import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, PayloadRequest } from 'payload'
import type { Company } from '@/payload-types'

import { toStringID, type MaybeID } from '@/utilities/toStringID'

const getCompanyIdentityID = async ({
  companyID,
  req,
}: {
  companyID: string
  req: PayloadRequest
}): Promise<null | string> => {
  const company = await req.payload.findByID({
    collection: 'companies',
    id: companyID,
    depth: 0,
    overrideAccess: false,
    req,
  })

  return toStringID(company.identity as MaybeID)
}

export const syncCompanyIdentityId: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const next = { ...(data ?? {}) }
  const companyInput = (next.company ?? originalDoc?.company) as MaybeID
  const companyID = toStringID(companyInput)

  if (!companyID) {
    next.companyIdentityId = null
    return next
  }

  next.companyIdentityId = await getCompanyIdentityID({
    companyID,
    req,
  })

  return next
}

export const syncCompanyChildrenIdentity: CollectionAfterChangeHook<Company> = async ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  const identity = toStringID(doc.identity)
  if (operation !== 'update' || identity === toStringID(previousDoc?.identity)) {
    return doc
  }
  await (['products', 'jobs'] as const).reduce(async (previous, collection) => {
    await previous
    await req.payload.update({
      collection,
      where: { company: { equals: doc.id } },
      data: { companyIdentityId: identity },
      overrideAccess: true,
      req,
    })
  }, Promise.resolve())
  return doc
}
