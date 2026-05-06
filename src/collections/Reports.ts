import type { ClientUser, CollectionConfig, PayloadRequest } from 'payload'

import { lazySendReportCreatedNotifications } from '@/hooks/lazyCollectionHooks'

const isAdminUser = (user: ClientUser | null | undefined): boolean => user?.role?.includes('admin') || false
const adminOnly = ({ req }: { req: PayloadRequest }): boolean => isAdminUser(req.user)

export const Reports: CollectionConfig = {
  slug: 'reports',
  admin: {
    group: 'Moderation',
    hidden: ({ user }) => !isAdminUser(user),
    defaultColumns: ['userId', 'contentLink', 'reason', 'status', 'updatedAt'],
    useAsTitle: 'contentLink',
  },
  access: {
    admin: adminOnly,
    create: adminOnly,
    delete: adminOnly,
    read: adminOnly,
    update: adminOnly,
  },
  hooks: {
    afterChange: [lazySendReportCreatedNotifications],
  },
  indexes: [
    {
      fields: ['userId', 'contentLink'],
      unique: true,
    },
    {
      fields: ['userId'],
    },
    {
      fields: ['contentLink'],
    },
  ],
  fields: [
    {
      name: 'status',
      type: 'select',
      defaultValue: 'waiting',
      label: 'Status',
      options: [
        {
          label: 'Waiting',
          value: 'waiting',
        },
        {
          label: 'Resolved',
          value: 'resolved',
        },
        {
          label: 'Ignored',
          value: 'ignored',
        },
      ],
      access: {
        update: adminOnly,
      },
    },
    {
      name: 'userId',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      maxDepth: 0,
    },
    {
      name: 'contentLink',
      type: 'text',
      required: true,
    },
    {
      name: 'reason',
      type: 'text',
      required: true,
    },
  ],
  timestamps: true,
}
