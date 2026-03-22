import type { Company, Identity, Job, Product, Startup } from '@/payload-types'
import { NOTIFICATION_TARGET_LABELS, type NotificationTargetCollection } from '@/newsletter/constants'
import {
  buildNotificationSubscriptionUnsubscribeURL,
  getNotificationRecipientsForTarget,
} from '@/newsletter/notificationSubscriptions'
import type { CollectionAfterChangeHook, PayloadRequest } from 'payload'
import { getNotificationDocumentTitle, renderItemUpdateEmail } from '@/utilities/notificationDiff'

type ParentNotificationDoc = Company | Identity
type ParentNotificationTargetCollection = 'companies' | 'identities'
type ChildNotificationDoc = Company | Job | Product | Startup
type ChildNotificationTargetCollection = 'companies' | 'jobs' | 'products' | 'startups'

type RelatedItemNotificationConfig<TDoc extends ChildNotificationDoc> = {
  childCollection: ChildNotificationTargetCollection
  getParentID: (doc: TDoc) => string | null
  parentCollection: ParentNotificationTargetCollection
}

type PublishableDoc = {
  _status?: 'draft' | 'published' | null
}

const isPublished = (doc: PublishableDoc): boolean => doc._status === 'published'

const shouldNotifyRelatedItemPublication = ({
  doc,
  operation,
  previousDoc,
}: {
  doc: PublishableDoc
  operation: 'create' | 'update'
  previousDoc?: PublishableDoc
}): boolean => {
  if (operation === 'create') {
    return isPublished(doc)
  }

  return isPublished(doc) && !isPublished(previousDoc ?? {})
}

const getParentNotificationDocument = async ({
  parentCollection,
  parentID,
  req,
}: {
  parentCollection: ParentNotificationTargetCollection
  parentID: string
  req: PayloadRequest
}): Promise<ParentNotificationDoc | null> => {
  try {
    return await req.payload.findByID({
      collection: parentCollection,
      depth: 0,
      id: parentID,
      overrideAccess: true,
      req,
    })
  } catch {
    return null
  }
}

export const sendRelatedItemPublishedNotifications = <TDoc extends ChildNotificationDoc>({
  childCollection,
  getParentID,
  parentCollection,
}: RelatedItemNotificationConfig<TDoc>): CollectionAfterChangeHook<TDoc> => {
  return async ({ doc, operation, previousDoc, req }) => {
    if (operation !== 'create' && operation !== 'update') {
      return doc
    }

    if (!shouldNotifyRelatedItemPublication({ doc, operation, previousDoc })) {
      return doc
    }

    const parentID = getParentID(doc)

    if (!parentID) {
      return doc
    }

    const recipients = await getNotificationRecipientsForTarget({
      req,
      targetCollection: parentCollection,
      targetID: parentID,
    })

    if (recipients.length === 0) {
      return doc
    }

    const parentDoc = await getParentNotificationDocument({
      parentCollection,
      parentID,
      req,
    })

    if (!parentDoc) {
      return doc
    }

    const childTitle = getNotificationDocumentTitle({
      collection: childCollection as NotificationTargetCollection,
      doc,
    })
    const parentTitle = getNotificationDocumentTitle({
      collection: parentCollection,
      doc: parentDoc,
    })
    const eyebrow = `New ${NOTIFICATION_TARGET_LABELS[childCollection]}`
    const intro = `A new ${NOTIFICATION_TARGET_LABELS[childCollection].toLowerCase()} was published under the ${NOTIFICATION_TARGET_LABELS[parentCollection].toLowerCase()} you follow: ${parentTitle}.`

    const deliveryResults = await Promise.allSettled(
      recipients.map(async (recipient) => {
        const email = await renderItemUpdateEmail({
          eyebrow,
          changes: [
            {
              after: 'Published',
              before: 'Draft',
              label: 'Publication',
              path: '_status',
            },
          ],
          collection: childCollection,
          docID: String(doc.id),
          intro,
          title: childTitle,
          unsubscribeURL: buildNotificationSubscriptionUnsubscribeURL({
            email: recipient.email,
            targetCollection: parentCollection,
            targetID: parentID,
          }),
        })

        return req.payload.sendEmail({
          html: email.html,
          subject: `New ${NOTIFICATION_TARGET_LABELS[childCollection]}: ${childTitle}`,
          text: email.text,
          to: recipient.email,
        })
      }),
    )

    deliveryResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        req.payload.logger.error(
          `Failed to send related-item notification email to ${recipients[index]?.email || 'recipient'}.`,
        )
      }
    })

    return doc
  }
}
