import type { CollectionConfig } from 'payload'

import { anyone } from '@/access/anyone'
import { adminOrSelf } from '@/access/adminOrSelf'

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: ({ req }) => Boolean(req.user),
    create: anyone,
    delete: adminOrSelf,
    read: adminOrSelf,
    update: adminOrSelf,
  },
  admin: {
    defaultColumns: ['name', 'email'],
    useAsTitle: 'name',
    hidden: ({ user }) => !user?.role?.includes('admin'),
  },
  hooks: {
    beforeChange: [
      async ({ req, operation, data }) => {
        if (operation === 'create') {
          const existing = await req.payload.find({
            collection: 'users',
            limit: 1,
          })
          if (existing.totalDocs === 0) {
            return { ...data, role: ['admin'] }
          }
        }
        return data
      },
    ],
  },
  auth: true,
  fields: [],
  timestamps: true,
}
