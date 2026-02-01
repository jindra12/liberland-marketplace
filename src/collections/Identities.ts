import type { CollectionConfig } from 'payload'

export const Identities: CollectionConfig = {
  slug: 'identities',
  admin: {
    useAsTitle: 'name',
    group: 'Directory',
    defaultColumns: ['name', 'website', 'company'],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'website', type: 'text' },
  ],
}
