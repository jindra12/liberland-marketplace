import type { PayloadRequest } from 'payload'

import { renderNotificationEmailHTML } from '@/emails/renderNotificationEmailHTML'
import type { NotificationEmailDetail } from '@/emails/NotificationEmail'

type NotificationEmailContent = {
  html: string
  text: string
}

export const buildNotificationEmail = async ({
  details,
  footer,
  intro,
  title,
}: {
  details: NotificationEmailDetail[]
  footer?: string
  intro: string
  title: string
}): Promise<NotificationEmailContent> => {
  const html = await renderNotificationEmailHTML({
    details,
    footer,
    intro,
    title,
  })

  const text = [
    title,
    '',
    intro,
    '',
    ...details.map((detail) => `${detail.label}: ${detail.value}`),
    footer || '',
  ]
    .filter((line) => line.length > 0)
    .join('\n')

  return {
    html,
    text,
  }
}

export const sendNotificationEmails = async ({
  recipients,
  req,
  subject,
  content,
}: {
  content: NotificationEmailContent
  recipients: string[]
  req: PayloadRequest
  subject: string
}): Promise<void> => {
  const uniqueRecipients = Array.from(new Set(recipients.filter((recipient) => recipient.length > 0)))

  await Promise.allSettled(
    uniqueRecipients.map(async (recipient) => {
      return req.payload.sendEmail({
        html: content.html,
        subject,
        text: content.text,
        to: recipient,
      })
    }),
  )
}
