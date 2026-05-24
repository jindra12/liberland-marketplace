import type { CollectionConfig } from 'payload'

import { createdByField } from '@/fields/createdByField'
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
    createdByField,
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
