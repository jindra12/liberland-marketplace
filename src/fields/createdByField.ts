import type { Field } from 'payload'

export const createdByField: Field = ({
  name: 'createdBy',
  type: 'relationship',
  relationTo: 'users',
  required: false,
  defaultValue: ({ user }: { user?: { id?: string | number | null } | null }) =>
    user?.id ?? null,
  maxDepth: 0,
  admin: {
    hidden: true,
    readOnly: true,
  },
})
