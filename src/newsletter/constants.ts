export const NEWSLETTER_SUBSCRIBERS_SLUG = 'subscribers'
export const NEWSLETTER_SETTINGS_SLUG = 'newsletter-settings'
export const NOTIFICATION_SUBSCRIPTIONS_SLUG = 'notification-subscriptions'

export const NOTIFICATION_TARGET_OPTIONS = [
  { label: 'Company', value: 'companies' },
  { label: 'Job', value: 'jobs' },
  { label: 'Product', value: 'products' },
  { label: 'Startup', value: 'startups' },
  { label: 'Tribe', value: 'identities' },
] as const

export type NotificationTargetCollection = (typeof NOTIFICATION_TARGET_OPTIONS)[number]['value']

export const NOTIFICATION_TARGET_LABELS: Record<NotificationTargetCollection, string> = {
  companies: 'Company',
  identities: 'Tribe',
  jobs: 'Job',
  products: 'Product',
  startups: 'Venture',
}

export const NOTIFICATION_TARGET_FRONTEND_PATHS: Record<NotificationTargetCollection, string> = {
  companies: 'companies',
  identities: 'tribes',
  jobs: 'jobs',
  products: 'products-services',
  startups: 'ventures',
}

export const NOTIFICATION_TARGET_QUERY_TYPES: Record<NotificationTargetCollection, string> = {
  companies: 'Companies',
  identities: 'Identities',
  jobs: 'Jobs',
  products: 'Products',
  startups: 'Ventures',
}
