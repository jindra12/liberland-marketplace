import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'
import { markdownField } from '@/fields/markdownField'
import { onlyOwnDocsOrAdmin, onlyOwnDocsOrAdminFilter } from '@/access/onlyOwnDocsOrAdmin'
import type { CollectionConfig } from 'payload'

export const Companies: CollectionConfig = {
  slug: 'companies',
  admin: {
    useAsTitle: 'name',
    group: 'Directory',
    defaultColumns: ['name', 'website', 'phone', 'email'],
    baseFilter: ({ req }) => {
      const filter = onlyOwnDocsOrAdminFilter({ user: req.user })
      return typeof filter === 'object' ? filter : null
    },
  },
  access: {
    create: authenticated,
    delete: onlyOwnDocsOrAdmin,
    read: anyone,
    update: onlyOwnDocsOrAdmin,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'website', type: 'text' },
    { name: 'phone', type: 'text' },
    { name: 'email', type: 'email' },
    {
      name: "image",
      type: "upload",
      relationTo: "media",
    },
    markdownField({
      name: 'description',
      label: 'Description',
    }),
    {
      name: 'identity',
      type: 'relationship',
      relationTo: 'identities',
      required: true,
      admin: {
        allowCreate: true,
        allowEdit: true,
      },
    },
    {
      name: 'allowedIdentities',
      label: 'Allowed identities',
      type: 'relationship',
      relationTo: 'identities',
      hasMany: true,
      index: true,
      admin: {
        allowCreate: true,
        allowEdit: true,
      },
    },
    {
      name: 'disallowedIdentities',
      label: 'Disallowed identities',
      type: 'relationship',
      relationTo: 'identities',
      hasMany: true,
      index: true,
      admin: {
        allowCreate: true,
        allowEdit: true,
      },
    },
  ],
}
