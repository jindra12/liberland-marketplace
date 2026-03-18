import 'payload'

import type { NewsletterEmailService } from '@/newsletter/types'

declare module 'payload' {
  interface BasePayload {
    newsletterEmailService?: NewsletterEmailService
  }
}
