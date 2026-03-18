import type { Payload } from 'payload'
import type { NewsletterEmailService } from '@/newsletter/types'

export const createPayloadNewsletterEmailService = (payload: Payload): NewsletterEmailService => ({
  addContact: async () => {},
  getProvider: () => 'payload-nodemailer',
  removeContact: async () => {},
  send: async ({ html, subject, text, to }) => {
    await payload.sendEmail({
      html,
      subject,
      text,
      to,
    })
  },
  updateConfig: () => {},
  updateContact: async () => {},
})
