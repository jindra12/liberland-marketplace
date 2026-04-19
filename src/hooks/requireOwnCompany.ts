import { APIError, type CollectionBeforeChangeHook } from 'payload'

type MaybeID = null | number | string | { id?: unknown }

type MaybeOwnerDoc = {
  authors?: unknown
  createdBy?: unknown
}

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

const getOwnerID = (doc?: MaybeOwnerDoc | null): null | string => {
  const authors = Array.isArray(doc?.authors) ? doc.authors : []
  const authorID = authors.map((author) => toStringID(author as MaybeID)).find(Boolean)

  if (authorID) {
    return authorID
  }

  return toStringID(doc?.createdBy as MaybeID)
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

  const ownerSource =
    Object.prototype.hasOwnProperty.call(data ?? {}, 'authors') ||
    Object.prototype.hasOwnProperty.call(data ?? {}, 'createdBy')
      ? data
      : originalDoc
  const ownerID = getOwnerID(ownerSource)

  if (!ownerID) {
    throw new APIError('You can only attach records to companies you own.', 403)
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
        { createdBy: { equals: ownerID } },
      ],
    },
  })

  if (totalDocs > 0) {
    return data
  }

  throw new APIError('You can only attach records to companies you own.', 403)
}
