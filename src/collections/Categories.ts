import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { slugField } from 'payload'
import { authenticated } from '../access/authenticated'
import { onlyOwnDocsOrAdmin } from '@/access/onlyOwnDocsOrAdmin'

export const Categories: CollectionConfig = {
  slug: 'categories',
  access: {
    create: authenticated,
    delete: onlyOwnDocsOrAdmin,
    read: anyone,
    update: onlyOwnDocsOrAdmin,
  },
  admin: {
    useAsTitle: 'title',
    hidden: true,
    group: false,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    slugField({
      position: undefined,
    }),
  ],
}
