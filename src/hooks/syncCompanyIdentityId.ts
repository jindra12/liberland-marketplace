import type { CollectionBeforeChangeHook, PayloadRequest } from 'payload'

type MaybeID = null | number | string | { id?: unknown }

const toStringID = (value: MaybeID): null | string => {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)

  if (value && typeof value === 'object') {
    const nestedID = value.id
    if (typeof nestedID === 'string') return nestedID
    if (typeof nestedID === 'number') return String(nestedID)
  }

  return null
}

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
    operation === 'create' ||
    Object.prototype.hasOwnProperty.call(next, 'company') ||
    !originalDoc?.companyIdentityId

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
