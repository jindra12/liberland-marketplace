import type { CollectionConfig } from 'payload'

import { adminOnlyFieldAccess, isAdminUser } from '@/access/admin'
import { anyone } from '@/access/anyone'
import { adminOrSelf } from '@/access/adminOrSelf'
import { Forbidden } from 'payload'
import { shippingAddressField } from '@/fields/addressFields'
import { TEXT_INPUT_MAX_LENGTH } from '@/fields/constants'
import { userWalletsField } from '@/fields/userWalletsField'
import { createDefaultBotUser } from '@/hooks/createDefaultBotUser'
import { createDefaultCompany } from '@/hooks/createDefaultCompany'
import { populateReportedLinks } from './hooks/populateReportedLinks'
import { sanitizeUserCreateData } from './utils'

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
    hidden: ({ user }) => !isAdminUser(user),
  },
  hooks: {
    afterChange: [createDefaultCompany, createDefaultBotUser],
    afterRead: [populateReportedLinks],
    beforeChange: [
      async ({ req, operation, data }) => {
        if (data && (data as { banned?: boolean }).banned === true) {
          return {
            ...data,
            sessions: [],
          }
        }

        if (operation === 'create') {
          const existing = await req.payload.find({
            collection: 'users',
            limit: 1,
          })

          return sanitizeUserCreateData({
            data: data as {
              bot?: boolean
              emailVerified?: boolean
              role?: string[]
            },
            existingUserCount: existing.totalDocs,
            isAdmin: isAdminUser(req.user),
          })
        }
        return data
      },
      ({ req, operation, data, originalDoc }) => {
        if (operation !== 'update') return data
        if (!req.user) return data
        if (isAdminUser(req.user)) return data

        return {
          ...data,
          role: originalDoc?.role,
          email: originalDoc?.email,
          emailVerified: originalDoc?.emailVerified,
          bot: originalDoc?.bot,
        }
      },
    ],
    beforeLogin: [
      ({ req, user }) => {
        if (!user?.banned) {
          return
        }

        throw new Forbidden(req.t)
      },
    ],
  },
  auth: true,
  fields: [
    {
      name: 'banned',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        hidden: true,
      },
      access: {
        create: adminOnlyFieldAccess,
        read: adminOnlyFieldAccess,
        update: adminOnlyFieldAccess,
      },
    },
    {
      name: 'phone',
      type: 'text',
      maxLength: TEXT_INPUT_MAX_LENGTH,
    },
    {
      name: 'bot',
      type: 'checkbox',
      defaultValue: false,
      access: {
        create: adminOnlyFieldAccess,
        update: adminOnlyFieldAccess,
      },
    },
    {
      name: 'reportedLinks',
      type: 'text',
      hasMany: true,
      virtual: true,
      maxLength: TEXT_INPUT_MAX_LENGTH,
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
