import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { createdByField } from '@/fields/createdByField'
import { TEXT_INPUT_MAX_LENGTH } from '@/fields/constants'
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
    createdByField,
    {
      name: 'title',
      type: 'text',
      required: true,
      maxLength: TEXT_INPUT_MAX_LENGTH,
    },
    {
      name: "image",
      type: "upload",
      relationTo: "media",
    },
    slugField({
      position: undefined,
    }),
  ],
}
