import type { CollectionBeforeChangeHook, PayloadRequest } from 'payload'

type MaybeID =
  | null
  | number
  | string
  | {
    _id?: unknown
    id?: unknown
    toHexString?: () => string
    value?: unknown
  }

const toStringID = (value: MaybeID): null | string => {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)

  if (value && typeof value === 'object') {
    if (typeof value.toHexString === 'function') {
      return value.toHexString()
    }

    const nestedID = value.id
    if (typeof nestedID === 'string') return nestedID
    if (typeof nestedID === 'number') return String(nestedID)

    const nestedMongoID = value._id
    if (typeof nestedMongoID === 'string') return nestedMongoID
    if (typeof nestedMongoID === 'number') return String(nestedMongoID)

    const nestedValueID = toStringID(value.value as MaybeID)
    if (nestedValueID) return nestedValueID

    const nestedObjectID = toStringID(value.id as MaybeID)
    if (nestedObjectID) return nestedObjectID

    const nestedMongoObjectID = toStringID(value._id as MaybeID)
    if (nestedMongoObjectID) return nestedMongoObjectID

    const asString = value.toString?.()
    if (typeof asString === 'string' && /^[a-f0-9]{24}$/i.test(asString)) {
      return asString
    }
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
  const companyWasProvided = Object.prototype.hasOwnProperty.call(next, 'company')
  const companyInput = (companyWasProvided ? next.company : originalDoc?.company) as MaybeID
  const companyID = toStringID(companyInput)

  if (!companyID) {
    if (operation === 'create' || companyWasProvided) {
      next.companyIdentityId = null
    } else {
      next.companyIdentityId = originalDoc?.companyIdentityId ?? null
    }

    return next
  }

  const shouldRecalculate =
    operation === 'create' ||
    companyWasProvided ||
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
