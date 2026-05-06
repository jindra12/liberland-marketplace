import type { CollectionAfterChangeHook } from 'payload'

import { getAdminNotificationEmails } from './adminNotificationEmails'
import { buildNotificationEmail, sendNotificationEmails } from './notificationEmails'

type ReportDoc = {
  contentLink: string
  id: string
  reason: string
  status?: string | null
}

export const sendReportCreatedNotifications: CollectionAfterChangeHook<ReportDoc> = async ({
  doc,
  operation,
  req,
}) => {
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
        label: 'Content link',
        value: doc.contentLink,
      },
      {
        label: 'Reason',
        value: doc.reason,
      },
      {
        label: 'Status',
        value: doc.status || 'waiting',
      },
    ],
    intro: 'A new report has been created and is waiting for moderation.',
    title: 'New report received',
  })

  await sendNotificationEmails({
    content,
    recipients,
    req,
    subject: 'New report received',
  })

  return doc
}
