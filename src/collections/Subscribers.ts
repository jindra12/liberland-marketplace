import type { CollectionConfig } from 'payload'

import { NEWSLETTER_SUBSCRIBERS_SLUG } from '@/newsletter/constants'

export const Subscribers: CollectionConfig = {
  slug: NEWSLETTER_SUBSCRIBERS_SLUG,
  admin: {
    hidden: true,
  },
  access: {
    create: () => false,
    delete: () => false,
    read: () => false,
    update: () => false,
  },
  fields: [
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
      maxDepth: 0,
      admin: {
        hidden: true,
        readOnly: true,
      },
    },
    {
      name: 'email',
      type: 'email',
      index: true,
      required: true,
      unique: true,
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      required: true,
    },
  ],
}
