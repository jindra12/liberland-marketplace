import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'
import { markdownField } from '@/fields/markdownField'
import { onlyOwnDocsOrAdmin } from '@/access/onlyOwnDocsOrAdmin'
import type { CollectionConfig } from 'payload'

export const Identities: CollectionConfig = {
  slug: 'identities',
  admin: {
    useAsTitle: 'name',
    group: 'Directory',
    defaultColumns: ['name', 'website', 'company'],
  },
  access: {
    create: authenticated,
    delete: onlyOwnDocsOrAdmin,
    read: onlyOwnDocsOrAdmin,
    update: onlyOwnDocsOrAdmin,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'website', type: 'text' },
    {
      name: "image",
      type: "upload",
      relationTo: "media",
    },
    markdownField({
      name: 'description',
      label: 'Description',
    }),
  ],
}
