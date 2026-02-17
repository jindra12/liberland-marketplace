import type { CollectionBeforeChangeHook, CollectionConfig, Config, Field } from 'payload'

const createdByField = (required: boolean): Field => ({
  name: 'createdBy',
  type: 'relationship',
  relationTo: 'users',
  required,
  maxDepth: 0,
  admin: { hidden: true, readOnly: true },
})

const getRelationshipID = (value: unknown): string | null => {
  if (!value) return null

  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)

  if (typeof value === 'object') {
    const relation = value as { id?: unknown; value?: unknown }

    if (typeof relation.id === 'string') return relation.id
    if (typeof relation.id === 'number') return String(relation.id)
    if (typeof relation.value === 'string') return relation.value
    if (typeof relation.value === 'number') return String(relation.value)
  }

  return null
}

const setCreatedBy: CollectionBeforeChangeHook = ({ operation, data, req, originalDoc }) => {
  const next = { ...data }
  const requestUserID = getRelationshipID(req.user?.id)
  const originalCreatedByID = getRelationshipID(originalDoc?.createdBy)

  if (operation === 'create') {
    next.createdBy = requestUserID
    return next
  }

  // Preserve original owner, but self-heal legacy documents that never had createdBy.
  next.createdBy = originalCreatedByID ?? requestUserID
  return next
}

export const addCreatedBy = (config: Config): Config => ({
  ...config,
  collections: (config.collections ?? []).map((collection: CollectionConfig) => {
    if (collection.slug === 'users') return collection

    const fields = collection.fields ?? []
    const hasCreatedBy = fields.some(
      (f) => typeof f === 'object' && f !== null && 'name' in f && f.name === 'createdBy',
    )

    return {
      ...collection,
      fields: hasCreatedBy ? fields : [createdByField(collection.slug !== 'comments'), ...fields],
      hooks: {
        ...collection.hooks,
        beforeChange: [setCreatedBy, ...(collection.hooks?.beforeChange ?? [])],
      },
    }
  }),
})
