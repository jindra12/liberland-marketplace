import type { CollectionConfig, Config, Field, FieldAccess } from 'payload'

const adminOnly: FieldAccess = ({ req }) => Boolean(req.user?.role?.includes('admin'))

const PROTECTED_FIELDS = ['email', 'emailVerified', 'role']

export const protectUserFields = (config: Config): Config => ({
  ...config,
  collections: (config.collections ?? []).map((collection: CollectionConfig) => {
    if (collection.slug !== 'users') return collection

    return {
      ...collection,
      fields: (collection.fields ?? []).map((field): Field => {
        if (!('name' in field) || !PROTECTED_FIELDS.includes(field.name)) return field
        if (field.type === 'ui' || field.type === 'join') return field

        return {
          ...field,
          access: {
            ...(field.access as Record<string, unknown>),
            update: adminOnly,
          },
        } as Field
      }),
    }
  }),
})
