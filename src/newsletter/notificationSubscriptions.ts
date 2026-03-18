import { createHash } from 'node:crypto'

import { APIError } from 'payload'
import type { PayloadRequest } from 'payload'

import type { NotificationSubscription, Subscriber, User } from '@/payload-types'
import {
  NEWSLETTER_SUBSCRIBERS_SLUG,
  NOTIFICATION_SUBSCRIPTIONS_SLUG,
  NOTIFICATION_TARGET_QUERY_TYPES,
  type NotificationTargetCollection,
} from '@/newsletter/constants'
import { getFrontendURL } from '@/utilities/getURL'

type NotificationSubscriptionRecipient = {
  email: string
}

const ACTIVE_SUBSCRIPTION_STATUS = 'active'
const ITEM_NOTIFICATION_SOURCE = 'item-notifications'
const USERS_COLLECTION_SLUG = 'users'

export const normalizeNotificationEmail = (email: string): string => email.toLowerCase()

export const getCurrentUserNotificationEmail = (req: PayloadRequest): string | null => {
  const email = req.user?.email

  if (!email) {
    return null
  }

  return normalizeNotificationEmail(email)
}

export const buildNotificationSubscriptionDocumentID = ({
  email,
  targetCollection,
  targetID,
}: {
  email: string
  targetCollection: NotificationTargetCollection
  targetID: string
}): string =>
  createHash('sha256')
    .update(`${normalizeNotificationEmail(email)}::${targetCollection}::${targetID}`)
    .digest('hex')

export const buildNotificationSubscriptionUnsubscribeURL = ({
  email,
  targetCollection,
  targetID,
}: {
  email: string
  targetCollection: NotificationTargetCollection
  targetID: string
}): string => {
  const unsubscribeURL = new URL('/unsubscribe', getFrontendURL())

  unsubscribeURL.searchParams.set('type', NOTIFICATION_TARGET_QUERY_TYPES[targetCollection])
  unsubscribeURL.searchParams.set('id', targetID)
  unsubscribeURL.searchParams.set('email', email)

  return unsubscribeURL.toString()
}

export const ensureNotificationTargetExists = async ({
  req,
  targetCollection,
  targetID,
}: {
  req: PayloadRequest
  targetCollection: NotificationTargetCollection
  targetID: string
}): Promise<void> => {
  try {
    await req.payload.findByID({
      collection: targetCollection,
      depth: 0,
      id: targetID,
      overrideAccess: false,
      req,
    })
  } catch {
    throw new APIError('Notification target not found.', 404)
  }
}

export const findLinkedUserByEmail = async ({
  email,
  req,
}: {
  email: string
  req: PayloadRequest
}): Promise<User | null> => {
  const result = await req.payload.find({
    collection: USERS_COLLECTION_SLUG,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
    where: {
      email: {
        equals: normalizeNotificationEmail(email),
      },
    },
  })

  return result.docs[0] ?? null
}

const findSubscriberByEmail = async ({
  email,
  req,
}: {
  email: string
  req: PayloadRequest
}): Promise<Subscriber | null> => {
  const result = await req.payload.find({
    collection: NEWSLETTER_SUBSCRIBERS_SLUG,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
    where: {
      email: {
        equals: normalizeNotificationEmail(email),
      },
    },
  })

  return result.docs[0] ?? null
}

export const ensureNotificationSubscriber = async ({
  email,
  req,
}: {
  email: string
  req: PayloadRequest
}): Promise<Subscriber> => {
  const normalizedEmail = normalizeNotificationEmail(email)
  const existingSubscriber = await findSubscriberByEmail({ email: normalizedEmail, req })

  if (!existingSubscriber) {
    return req.payload.create({
      collection: NEWSLETTER_SUBSCRIBERS_SLUG,
      data: {
        email: normalizedEmail,
        emailPreferences: {
          announcements: true,
          newsletter: true,
        },
        importedFromProvider: true,
        source: ITEM_NOTIFICATION_SOURCE,
        subscriptionStatus: ACTIVE_SUBSCRIPTION_STATUS,
      },
      overrideAccess: true,
      req,
    })
  }

  if (existingSubscriber.subscriptionStatus !== ACTIVE_SUBSCRIPTION_STATUS) {
    return req.payload.update({
      collection: NEWSLETTER_SUBSCRIBERS_SLUG,
      id: existingSubscriber.id,
      data: {
        importedFromProvider: true,
        source: ITEM_NOTIFICATION_SOURCE,
        subscriptionStatus: ACTIVE_SUBSCRIPTION_STATUS,
      },
      overrideAccess: true,
      req,
    })
  }

  return existingSubscriber
}

export const getNotificationSubscriptionByID = async ({
  id,
  req,
}: {
  id: string
  req: PayloadRequest
}): Promise<NotificationSubscription | null> => {
  try {
    return await req.payload.findByID({
      collection: NOTIFICATION_SUBSCRIPTIONS_SLUG,
      depth: 0,
      id,
      overrideAccess: true,
      req,
    })
  } catch {
    return null
  }
}

export const isCurrentUserSubscribedToTarget = async ({
  req,
  targetCollection,
  targetID,
}: {
  req: PayloadRequest
  targetCollection: NotificationTargetCollection
  targetID: string
}): Promise<boolean> => {
  const email = getCurrentUserNotificationEmail(req)

  if (!email) {
    return false
  }

  const subscription = await getNotificationSubscriptionByID({
    id: buildNotificationSubscriptionDocumentID({
      email,
      targetCollection,
      targetID,
    }),
    req,
  })

  return Boolean(subscription)
}

export const getNotificationRecipientsForTarget = async ({
  req,
  targetCollection,
  targetID,
}: {
  req: PayloadRequest
  targetCollection: NotificationTargetCollection
  targetID: string
}): Promise<NotificationSubscriptionRecipient[]> => {
  const subscriptions = await req.payload.find({
    collection: NOTIFICATION_SUBSCRIPTIONS_SLUG,
    depth: 0,
    limit: 1000,
    overrideAccess: true,
    req,
    where: {
      and: [
        {
          targetCollection: {
            equals: targetCollection,
          },
        },
        {
          targetID: {
            equals: targetID,
          },
        },
      ],
    },
  })

  if (subscriptions.docs.length === 0) {
    return []
  }

  const subscriberIDs = subscriptions.docs.map((subscription) => String(subscription.subscriber))

  const subscribers = await req.payload.find({
    collection: NEWSLETTER_SUBSCRIBERS_SLUG,
    depth: 0,
    limit: subscriberIDs.length || 1,
    overrideAccess: true,
    req,
    where: {
      and: [
        {
          id: {
            in: subscriberIDs,
          },
        },
        {
          subscriptionStatus: {
            equals: ACTIVE_SUBSCRIPTION_STATUS,
          },
        },
      ],
    },
  })

  const activeSubscriberIDs = new Set(subscribers.docs.map((subscriber) => String(subscriber.id)))

  return subscriptions.docs
    .filter((subscription) => activeSubscriberIDs.has(String(subscription.subscriber)))
    .map((subscription) => ({
      email: subscription.email,
    }))
}
