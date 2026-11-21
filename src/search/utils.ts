import type { CollectionBeforeOperationHook, PayloadRequest, Where } from 'payload'
import { searchRelationshipFilterSchema } from './schema'

const publicCompanySearchFilter = async (req: PayloadRequest): Promise<Where> => {
  const companies = await req.payload.find({
    collection: 'companies',
    where: { isPrivate: { equals: false } },
    select: { name: true },
    depth: 0,
    draft: false,
    pagination: false,
    limit: 0,
    overrideAccess: false,
    req,
  })

  return {
    and: [
      { 'doc.relationTo': { equals: 'companies' } },
      { 'doc.value': { in: companies.docs.map((company) => company.id) } },
    ],
  }
}

/** Convert the GraphQL relationship input into Payload operators before validation. */
export const normalizeSearchWhere = async (where: Where, req: PayloadRequest): Promise<Where> => ({
  and: await Promise.all(
    Object.entries(where).map(async ([path, constraint]): Promise<Where> => {
      if (['and', 'or'].includes(path.toLowerCase()) && Array.isArray(constraint)) {
        return {
          [path]: await Promise.all(constraint.map((clause) => normalizeSearchWhere(clause, req))),
        }
      }
      if (path !== 'doc') {
        return { [path]: constraint }
      }

      const parsed = searchRelationshipFilterSchema.safeParse(constraint)
      if (!parsed.success) {
        return { [path]: constraint }
      }

      const filter = parsed.data
      return {
        and: [
          ...(filter.relationTo ? [{ 'doc.relationTo': { equals: filter.relationTo } }] : []),
          ...(typeof filter.value === 'string' || typeof filter.value === 'number'
            ? [{ 'doc.value': { equals: filter.value } }]
            : []),
          ...(typeof filter.value === 'object' ? [await publicCompanySearchFilter(req)] : []),
        ],
      }
    }),
  ),
})

export const normalizeSearchQuery: CollectionBeforeOperationHook = async ({
  args,
  operation,
  req,
}) => {
  if (operation === 'read' && 'where' in args && args.where) {
    args.where = await normalizeSearchWhere(args.where, req)
  }
  return args
}
