import type { ClientUser, CollectionBeforeValidateHook, CollectionConfig } from 'payload'

import { adminOnly, isAdminUser } from '@/access/admin'
import { createdByField } from '@/fields/createdByField'
import { lazySendInformationRequestCreatedNotifications } from '@/hooks/lazyCollectionHooks'
const ownOrAdmin = ({ req: { user } }: { req: { user?: ClientUser | null } }) => {
  if (isAdminUser(user)) {
    return true
  }

  if (!user) {
    return false
  }

  return {
    user: {
      equals: user.id,
    },
  }
}

const attachUser: CollectionBeforeValidateHook = ({ data, operation, req }) => {
  if (operation !== 'create' || !req.user) {
    return data
  }

  return {
    ...data,
    user: req.user.id,
  }
}

export const InformationRequests: CollectionConfig = {
  slug: 'information-requests',
  admin: {
    group: 'Moderation',
    hidden: ({ user }) => !isAdminUser(user),
    defaultColumns: ['user', 'reason', 'updatedAt'],
    useAsTitle: 'reason',
  },
  access: {
    create: ({ req: { user } }) => Boolean(user),
    delete: adminOnly,
    read: ownOrAdmin,
    update: adminOnly,
  },
  hooks: {
    afterChange: [lazySendInformationRequestCreatedNotifications],
    beforeValidate: [attachUser],
  },
  fields: [
    createdByField,
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      maxDepth: 0,
      admin: {
        hidden: true,
        readOnly: true,
      },
    },
    {
      name: 'reason',
      type: 'text',
      required: true,
    },
  ],
  timestamps: true,
}
