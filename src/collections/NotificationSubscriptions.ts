import type {
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from 'payload'

import {
  canCreateNotificationSubscriptions,
  canDeleteNotificationSubscriptions,
  canReadNotificationSubscriptions,
} from '@/access/notificationSubscriptions'
import { createdByField } from '@/fields/createdByField'
import type { NotificationSubscription } from '@/payload-types'
import {
  NEWSLETTER_SUBSCRIBERS_SLUG,
  NOTIFICATION_SUBSCRIPTIONS_SLUG,
  NOTIFICATION_TARGET_OPTIONS,
  type NotificationTargetCollection,
} from '@/newsletter/constants'
import {
  buildNotificationSubscriptionDocumentID,
  ensureNotificationSubscriber,
  ensureNotificationTargetExists,
  getCurrentUserNotificationEmail,
} from '@/newsletter/notificationSubscriptions'
import {
  syncSubscriberCountAfterChange,
  syncSubscriberCountAfterDelete,
} from '@/hooks/updateContentRankingSignals'

const getNotificationTargetCollection = (
  value: NotificationSubscription['targetCollection'] | undefined | null,
): NotificationTargetCollection | null => (typeof value === 'string' ? value : null)

const prepareNotificationSubscription: CollectionBeforeValidateHook<NotificationSubscription> = ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create' || !data) {
    return data
  }

  const email = getCurrentUserNotificationEmail(req)
  const targetCollection = getNotificationTargetCollection(data.targetCollection)
  const targetID = typeof data.targetID === 'string' ? data.targetID : null

  return {
    ...data,
    createdBy: req.user ? req.user.id : data.createdBy,
    email: email ?? '',
    id:
      email && targetCollection && targetID
        ? buildNotificationSubscriptionDocumentID({
          email,
            targetCollection,
            targetID,
          })
        : data.id,
  }
}

const attachNotificationSubscriber: CollectionBeforeChangeHook<NotificationSubscription> = async ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create') {
    return data
  }

  const email = getCurrentUserNotificationEmail(req)
  const targetCollection = getNotificationTargetCollection(data.targetCollection)
  const targetID = typeof data.targetID === 'string' ? data.targetID : null

  if (!email || !targetCollection || !targetID) {
    return data
  }

  await ensureNotificationTargetExists({
    req,
    targetCollection,
    targetID,
  })

  const subscriber = await ensureNotificationSubscriber({
    email,
    req,
  })

  return {
    ...data,
    createdBy: req.user ? req.user.id : data.createdBy,
    email,
    subscriber: subscriber.id,
  }
}

export const NotificationSubscriptions: CollectionConfig = {
  slug: NOTIFICATION_SUBSCRIPTIONS_SLUG,
  admin: {
    hidden: true,
  },
  access: {
    create: canCreateNotificationSubscriptions,
    delete: canDeleteNotificationSubscriptions,
    read: canReadNotificationSubscriptions,
    update: () => false,
  },
  hooks: {
    beforeValidate: [prepareNotificationSubscription],
    beforeChange: [attachNotificationSubscriber],
    afterChange: [syncSubscriberCountAfterChange],
    afterDelete: [syncSubscriberCountAfterDelete],
  },
  fields: [
    {
      name: 'id',
      type: 'text',
      admin: {
        hidden: true,
        readOnly: true,
      },
    },
    createdByField,
    {
      name: 'email',
      type: 'email',
      index: true,
      required: false,
    },
    {
      name: 'subscriber',
      type: 'relationship',
      relationTo: NEWSLETTER_SUBSCRIBERS_SLUG,
      maxDepth: 0,
      admin: {
        hidden: true,
        readOnly: true,
      },
    },
    {
      name: 'targetCollection',
      type: 'select',
      index: true,
      options: [...NOTIFICATION_TARGET_OPTIONS],
      required: true,
    },
    {
      name: 'targetID',
      type: 'text',
      index: true,
      required: true,
    },
  ],
}
