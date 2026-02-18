import type { CollectionAfterChangeHook } from 'payload'

export const createDefaultCompany: CollectionAfterChangeHook = async ({
  operation,
  doc,
  req,
}) => {
  if (operation !== 'create') return doc

  const name = doc.name || doc.email
  const description = `${name}'s personal company`

  await req.payload.create({
    collection: 'companies',
    data: {
      name,
      description,
      email: doc.email,
      _status: 'draft',
    },
    user: doc,
    draft: true,
  })

  return doc
}
