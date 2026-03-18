import { newsletterPlugin } from 'payload-plugin-newsletter'
import type { NewsletterPluginConfig } from 'payload-plugin-newsletter/types'

import { NEWSLETTER_SETTINGS_SLUG, NEWSLETTER_SUBSCRIBERS_SLUG } from '@/newsletter/constants'

export const newsletterPluginConfig: NewsletterPluginConfig = {
  auth: {
    enabled: false,
  },
  features: {
    newsletterManagement: {
      enabled: false,
    },
    newsletterScheduling: {
      enabled: false,
    },
  },
  providers: {
    default: 'resend',
    resend: {
      apiKey: process.env.RESEND_API_KEY || 'disabled',
      fromAddress: process.env.SMTP_FROM_ADDRESS || 'noreply@liberland.org',
      fromName: process.env.SMTP_FROM_NAME || 'Liberland Marketplace',
      replyTo: process.env.SMTP_FROM_ADDRESS || 'noreply@liberland.org',
    },
  },
  settingsSlug: NEWSLETTER_SETTINGS_SLUG,
  subscribersSlug: NEWSLETTER_SUBSCRIBERS_SLUG,
}

export const newsletter = newsletterPlugin(newsletterPluginConfig)
