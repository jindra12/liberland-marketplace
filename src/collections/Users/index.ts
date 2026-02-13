import type { CollectionConfig } from 'payload'

import { anyone } from '@/access/anyone'
import { adminOrSelf } from '@/access/adminOrSelf'

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: ({ req }) => req.user?.isAdmin || false,
    create: anyone,
    delete: adminOrSelf,
    read: adminOrSelf,
    update: adminOrSelf,
  },
  admin: {
    defaultColumns: ['name', 'email'],
    useAsTitle: 'name',
  },
  hooks: {
    beforeChange: [
      async ({ req, operation, data }) => {
        const next = { ...data }
        if (operation === 'create') {
          const existing = await req.payload.find({
            collection: 'users',
            limit: 1,
          })
          const isFirstUser = existing.totalDocs === 0
          if (isFirstUser) {
            return {
              ...next,
              isAdmin: true,
            }
          }
        }
        delete next.isAdmin
        return next
      },
    ],
  },
  auth: true,
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'isAdmin',
      type: 'checkbox',
      defaultValue: false,
      admin: { position: 'sidebar' },
      access: {
        update: ({ req }) => req.user?.isAdmin || false,
        create: ({ req }) => req.user?.isAdmin || false,
        read: () => true,
      },
    },
  ],
  timestamps: true,
}
