import type { CollectionAfterChangeHook, RequiredDataFromCollectionSlug } from 'payload'

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
  const companyData = {
    createdBy: doc.id,
    isPrivate: true,
    name,
    description,
    email: doc.email,
    identity,
    _status: 'draft',
  } satisfies RequiredDataFromCollectionSlug<'companies'>

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
