import type { CollectionConfig } from 'payload'

import { anyone } from '@/access/anyone'
import { adminOrSelf } from '@/access/adminOrSelf'
import { shippingAddressField } from '@/fields/addressFields'
import { userWalletsField } from '@/fields/userWalletsField'
import { createDefaultBotUser } from '@/hooks/createDefaultBotUser'
import { createDefaultCompany } from '@/hooks/createDefaultCompany'
import { populateReportedLinks } from './hooks/populateReportedLinks'

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
    afterChange: [createDefaultCompany, createDefaultBotUser],
    afterRead: [populateReportedLinks],
    beforeChange: [
      async ({ req, operation, data }) => {
        if (operation === 'create') {
          const existing = await req.payload.find({
            collection: 'users',
            limit: 1,
          })
          if (existing.totalDocs === 0) {
            return {
              ...data,
              bot: false,
              role: ['admin'],
            }
          }

          if (!req.user?.role?.includes('admin')) {
            return {
              ...data,
              bot: false,
            }
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
          bot: originalDoc?.bot,
        }
      },
    ],
  },
  auth: true,
  fields: [
    {
      name: 'phone',
      type: 'text',
    },
    {
      name: 'bot',
      type: 'checkbox',
      defaultValue: false,
      access: {
        create: ({ req }) => Boolean(req.user?.role?.includes('admin')),
        update: ({ req }) => Boolean(req.user?.role?.includes('admin')),
      },
    },
    {
      name: 'reportedLinks',
      type: 'text',
      hasMany: true,
      virtual: true,
      admin: {
        hidden: true,
        readOnly: true,
      },
    },
    shippingAddressField(),
    userWalletsField(),
  ],
  timestamps: true,
}
