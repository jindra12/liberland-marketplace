import type { CollectionConfig } from 'payload'

import { anyone } from '@/access/anyone'
import { adminOrSelf } from '@/access/adminOrSelf'
import { createDefaultCompany } from '@/hooks/createDefaultCompany'

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
    afterChange: [createDefaultCompany],
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
      ({ req, operation, data, originalDoc }) => {
        if (operation !== 'update') return data
        if (!req.user) return data
        if (req.user.role?.includes('admin')) return data

        return {
          ...data,
          role: originalDoc?.role,
          email: originalDoc?.email,
          emailVerified: originalDoc?.emailVerified,
        }
      },
    ],
  },
  auth: true,
  fields: [],
  timestamps: true,
}
