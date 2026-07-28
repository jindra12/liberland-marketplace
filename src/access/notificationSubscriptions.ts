import type { Access } from 'payload'

import type { NotificationSubscription } from '@/payload-types'
import { onlyOwnDocsOrAdminFilter } from '@/access/onlyOwnDocsOrAdmin'
import { getCurrentUserNotificationEmail } from '@/newsletter/notificationSubscriptions'

export const canReadNotificationSubscriptions: Access<NotificationSubscription> = ({ req }) => {
  return onlyOwnDocsOrAdminFilter({ user: req.user })
}

export const canCreateNotificationSubscriptions: Access<NotificationSubscription> = async ({
  req,
}) => {
  return Boolean(req.user?.id && getCurrentUserNotificationEmail(req))
}

export const canDeleteNotificationSubscriptions: Access<NotificationSubscription> = async ({
  req,
}) => {
  return onlyOwnDocsOrAdminFilter({ user: req.user })
}
