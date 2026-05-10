import type { CollectionAfterChangeHook } from 'payload'

import { getAdminNotificationEmails } from './adminNotificationEmails'
import { buildNotificationEmail, sendNotificationEmails } from './notificationEmails'

type InformationRequestDoc = {
  id: string
  reason: string
  user: string | { id?: string | null } | null
}

export const sendInformationRequestCreatedNotifications: CollectionAfterChangeHook<
  InformationRequestDoc
> = async ({ doc, operation, req }) => {
  if (operation !== 'create') {
    return doc
  }

  const recipients = await getAdminNotificationEmails({ req })

  if (recipients.length === 0) {
    return doc
  }

  const content = await buildNotificationEmail({
    details: [
      {
        label: 'User',
        value: typeof doc.user === 'string' ? doc.user : doc.user?.id || 'unknown',
      },
      {
        label: 'Reason',
        value: doc.reason,
      },
    ],
    intro: 'A new GDPR information request has been created.',
    title: 'New information request',
  })

  await sendNotificationEmails({
    content,
    recipients,
    req,
    subject: 'New information request received',
  })

  return doc
}
