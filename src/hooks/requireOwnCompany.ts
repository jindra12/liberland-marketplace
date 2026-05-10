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

const isBotUser = (user: unknown): boolean => {
  if (!user || typeof user !== 'object' || !('bot' in user)) {
    return false
  }

  return (user as { bot?: unknown }).bot === true
}

const canBotBypassOwnership = async ({
  companyID,
  req,
}: {
  companyID: string
  req: Parameters<CollectionBeforeChangeHook>[0]['req']
}): Promise<boolean> => {
  const company = await req.payload.findByID({
    collection: 'companies',
    depth: 0,
    id: companyID,
    overrideAccess: true,
    req,
  })

  return Reflect.get(company, 'noAutoPost') !== true
}

export const requireOwnCompany: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const companyInput = (data?.company ?? originalDoc?.company) as MaybeID
  const companyID = toStringID(companyInput)

  if (isBotUser(req.user) && companyID) {
    if (await canBotBypassOwnership({ companyID, req })) {
      return data
    }
  }

  if (isBotUser(req.user) && !companyID) {
    return data
  }

  if (!companyID) {
    return data
  }

  if (operation !== 'create' && !(data && 'company' in data)) {
    return data
  }

  const ownerSource = data && ('authors' in data || 'createdBy' in data) ? data : originalDoc
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
