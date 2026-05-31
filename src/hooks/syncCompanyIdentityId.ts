import type { CollectionBeforeChangeHook, PayloadRequest } from 'payload'

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
  operation,
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

  const shouldRecalculate =
    operation === 'create' || 'company' in next || !originalDoc?.companyIdentityId

  if (!shouldRecalculate) {
    next.companyIdentityId = originalDoc?.companyIdentityId ?? null
    return next
  }

  next.companyIdentityId = await getCompanyIdentityID({
    companyID,
    req,
  })

  return next
}
