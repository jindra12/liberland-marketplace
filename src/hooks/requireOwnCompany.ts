import { APIError, type CollectionBeforeChangeHook } from 'payload'

import type { User } from '@/payload-types'

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

const isAdmin = (user?: Partial<User> | null): boolean => {
  return Array.isArray(user?.role) && user.role.includes('admin')
}

export const requireOwnCompany: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const companyInput = (data?.company ?? originalDoc?.company) as MaybeID
  const companyID = toStringID(companyInput)

  if (!companyID) {
    return data
  }

  if (operation !== 'create' && !Object.prototype.hasOwnProperty.call(data ?? {}, 'company')) {
    return data
  }

  if (!req.user || isAdmin(req.user)) {
    return data
  }

  const { totalDocs } = await req.payload.find({
    collection: 'companies',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    req,
    where: {
      and: [
        { id: { equals: companyID } },
        { createdBy: { equals: req.user.id } },
      ],
    },
  })

  if (totalDocs > 0) {
    return data
  }

  throw new APIError('You can only attach records to companies you own.', 403)
}
