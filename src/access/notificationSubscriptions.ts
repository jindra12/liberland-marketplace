import type { Access, PayloadRequest } from 'payload'

import type { NotificationSubscription } from '@/payload-types'
import {
  findLinkedUserByEmail,
  getCurrentUserNotificationEmail,
  getNotificationSubscriptionByID,
  normalizeNotificationEmail,
} from '@/newsletter/notificationSubscriptions'

const canCurrentUserManageLinkedEmail = ({
  email,
  req,
}: {
  email: string
  req: PayloadRequest
}): boolean => getCurrentUserNotificationEmail(req) === normalizeNotificationEmail(email)

export const canReadNotificationSubscriptions: Access<NotificationSubscription> = ({ req }) => {
  const email = getCurrentUserNotificationEmail(req)

  if (!email) {
    return false
  }

  return {
    email: {
      equals: email,
    },
  }
}

export const canCreateNotificationSubscriptions: Access<NotificationSubscription> = async ({
  data,
  req,
}) => {
  const email = typeof data?.email === 'string' ? normalizeNotificationEmail(data.email) : null

  if (!email) {
    return true
  }

  const linkedUser = await findLinkedUserByEmail({ email, req })

  if (!linkedUser) {
    return true
  }

  return canCurrentUserManageLinkedEmail({ email, req })
}

export const canDeleteNotificationSubscriptions: Access<NotificationSubscription> = async ({
  id,
  req,
}) => {
  const subscriptionID =
    typeof id === 'string' || typeof id === 'number' ? String(id) : null

  if (!subscriptionID) {
    return false
  }

  const subscription = await getNotificationSubscriptionByID({
    id: subscriptionID,
    req,
  })

  if (!subscription) {
    return true
  }

  const linkedUser = await findLinkedUserByEmail({
    email: subscription.email,
    req,
  })

  if (!linkedUser) {
    return true
  }

  return canCurrentUserManageLinkedEmail({
    email: subscription.email,
    req,
  })
}
