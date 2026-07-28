import type { Field } from 'payload'

import type { NotificationTargetCollection } from '@/newsletter/constants'
import { isCurrentUserSubscribedToTarget } from '@/newsletter/notificationSubscriptions'

const getNotificationSubscriptionTargetID = (data: unknown): number | string | null => {
  if (!data || typeof data !== 'object' || !('id' in data)) {
    return null
  }

  const { id } = data

  if (typeof id === 'string' || typeof id === 'number') {
    return id
  }

  return null
}

export const notificationSubscriptionStatusField = (
  targetCollection: NotificationTargetCollection,
): Field => ({
  name: 'isSubscribed',
  type: 'checkbox',
  virtual: true,
  admin: {
    hidden: true,
    readOnly: true,
  },
  access: {
    create: () => false,
    update: () => false,
  },
  hooks: {
    afterRead: [
      async ({ data, req }) => {
        const targetID = getNotificationSubscriptionTargetID(data)

        if (targetID === null) {
          return false
        }

        return isCurrentUserSubscribedToTarget({
          req,
          targetCollection,
          targetID: String(targetID),
        })
      },
    ],
  },
})
