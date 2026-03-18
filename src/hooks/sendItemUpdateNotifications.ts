import type { Company, Identity, Job, Product, Startup } from '@/payload-types'
import type { CollectionAfterChangeHook } from 'payload'

import type { NotificationTargetCollection } from '@/newsletter/constants'
import {
  buildNotificationSubscriptionUnsubscribeURL,
  getNotificationRecipientsForTarget,
} from '@/newsletter/notificationSubscriptions'
import {
  collectDocumentChanges,
  getNotificationDocumentTitle,
  renderItemUpdateEmail,
} from '@/utilities/notificationDiff'

type NotificationTargetDoc = Company | Identity | Job | Product | Startup

export const sendItemUpdateNotifications = (
  targetCollection: NotificationTargetCollection,
): CollectionAfterChangeHook<NotificationTargetDoc> => {
  return async ({ doc, operation, previousDoc, req }) => {
    if (operation !== 'update') {
      return doc
    }

    const fields =
      req.payload.config.collections.find(({ slug }) => slug === targetCollection)?.fields ?? []

    const changes = collectDocumentChanges({
      fields,
      nextDoc: doc,
      previousDoc,
    })

    if (changes.length === 0) {
      return doc
    }

    const recipients = await getNotificationRecipientsForTarget({
      req,
      targetCollection,
      targetID: String(doc.id),
    })

    if (recipients.length === 0) {
      return doc
    }

    const title = getNotificationDocumentTitle({
      collection: targetCollection,
      doc,
    })

    const deliveryResults = await Promise.allSettled(
      recipients.map(async (recipient) => {
        const email = await renderItemUpdateEmail({
          changes,
          collection: targetCollection,
          docID: String(doc.id),
          title,
          unsubscribeURL: buildNotificationSubscriptionUnsubscribeURL({
            email: recipient.email,
            targetCollection,
            targetID: String(doc.id),
          }),
        })

        return req.payload.sendEmail({
          html: email.html,
          subject: `${title} just got an update!`,
          text: email.text,
          to: recipient.email,
        })
      }),
    )

    deliveryResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        req.payload.logger.error(
          `Failed to send item notification email to ${recipients[index]?.email || 'recipient'}.`,
        )
      }
    })

    return doc
  }
}
