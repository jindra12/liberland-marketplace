import { APIError, type CollectionBeforeChangeHook } from 'payload'

import type { AccessUser } from '@/access/types'
import { toStringID, type MaybeID } from '@/utilities/toStringID'

type MaybeOwnerDoc = {
  authors?: unknown
  createdBy?: unknown
}

type BotAccessUser = Exclude<AccessUser, null | undefined> & {
  bot?: boolean | null
}

const getOwnerID = (doc?: MaybeOwnerDoc | null): null | string => {
  const authors = Array.isArray(doc?.authors) ? doc.authors : []
  const authorID = authors.map((author) => toStringID(author as MaybeID)).find(Boolean)

  if (authorID) {
    return authorID
  }

  return toStringID(doc?.createdBy as MaybeID)
}

const isBotUser = (user: AccessUser): user is BotAccessUser => {
  if (!user) {
    return false
  }

  return 'bot' in user && user.bot === true
}

const isAdminUser = (user: AccessUser): boolean => user?.role?.includes('admin') || false

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

  if (
    typeof company === 'object' &&
    company !== null &&
    'noAutoPost' in company &&
    company.noAutoPost === true
  ) {
    return false
  }

  return true
}

export const requireOwnCompany: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (isAdminUser(req.user)) {
    return data
  }

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
  const ownerID =
    getOwnerID(ownerSource) ?? (operation === 'create' ? toStringID(req.user?.id as MaybeID) : null)

  if (!ownerID) {
    throw new APIError('You can only attach records to companies you own.', 403)
  }

  const { totalDocs } = await req.payload.find({
    collection: 'companies',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
    where: {
      and: [{ id: { equals: companyID } }, { createdBy: { equals: ownerID } }],
    },
  })

  if (totalDocs > 0) {
    return data
  }

  throw new APIError('You can only attach records to companies you own.', 403)
}
