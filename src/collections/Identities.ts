import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'
import { markdownField } from '@/fields/markdownField'
import { serverURLField } from '@/fields/serverURLField'
import { onlyOwnDocsOrAdmin } from '@/access/onlyOwnDocsOrAdmin'
import type { CollectionConfig } from 'payload'

export const Identities: CollectionConfig = {
  slug: 'identities',
  labels: {
    singular: 'Tribe',
    plural: 'Tribes',
  },
  admin: {
    useAsTitle: 'name',
    group: 'Directory',
    defaultColumns: ['name', 'website', 'company'],
  },
  access: {
    create: authenticated,
    delete: onlyOwnDocsOrAdmin,
    read: anyone,
    update: onlyOwnDocsOrAdmin,
  },
  fields: [
    serverURLField(),
    { name: 'name', type: 'text', required: true },
    { name: 'website', type: 'text' },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
    },
    markdownField({
      name: 'description',
      label: 'Description',
    }),
    {
      name: 'itemCount',
      type: 'number',
      defaultValue: 0,
      index: true,
      admin: {
        hidden: true,
        readOnly: true,
      },
      access: {
        create: () => false,
        update: () => false,
      },
    },
  ],
}
