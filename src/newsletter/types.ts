import type { SendEmailParams, Subscriber } from 'payload-plugin-newsletter/types'

export type NewsletterEmailServiceConfig = Record<
  string,
  boolean | null | number | string | undefined
>

export type NewsletterEmailService = {
  addContact: (_contact: Subscriber) => Promise<void>
  getProvider: () => string
  removeContact: (_email: string) => Promise<void>
  send: (params: SendEmailParams) => Promise<void>
  updateConfig: (_config: NewsletterEmailServiceConfig) => void
  updateContact: (_contact: Subscriber) => Promise<void>
}
