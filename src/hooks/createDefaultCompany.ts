import type { CollectionAfterChangeHook } from 'payload'

export const createDefaultCompany: CollectionAfterChangeHook = async ({
  operation,
  doc,
  req,
}) => {
  if (operation !== 'create') return doc
  const identity = doc.identity
  if (!identity) return doc

  const name = doc.name || doc.email
  const description = `${name}'s personal company`
  const shouldCreatePrivateCompany =
    !req.user?.role?.includes('admin') &&
    process.env.BLOCK_NON_ADMIN_CONTENT_CREATION === 'true'

  const companyData = {
    createdBy: doc.id,
    isPrivate: shouldCreatePrivateCompany,
    name,
    description,
    email: doc.email,
    identity,
    _status: 'draft' as const,
  }

  await req.payload.create({
    collection: 'companies',
    data: companyData,
    overrideAccess: true,
    user: doc,
    draft: true,
    req,
  })

  return doc
}
