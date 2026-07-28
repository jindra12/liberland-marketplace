import { APIError, type CollectionBeforeChangeHook } from 'payload'

import { toStringID, type MaybeID } from '@/utilities/toStringID'

export const requirePublicCompany: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const companyInput = (data?.company ?? originalDoc?.company) as MaybeID
  const companyID = toStringID(companyInput)

  if (!companyID) {
    return data
  }

  const company = await req.payload.findByID({
    collection: 'companies',
    depth: 0,
    id: companyID,
    overrideAccess: true,
    req,
  })

  if (company.isPrivate) {
    throw new APIError('Private companies cannot be used for jobs, products, or ventures.', 403)
  }

  return data
}
