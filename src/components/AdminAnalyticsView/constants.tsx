import type { AdminAnalyticsMetricDefinition } from './types'

export const ADMIN_DASHBOARD_HREF = '/admin'
export const ADMIN_LOGIN_HREF = '/admin/login'
export const ADMIN_ANALYTICS_HREF = '/admin/analytics'
export const DEFAULT_EVENTS_PAGE = 1
export const ANALYTICS_EYEBROW = 'Analytics'
export const ANALYTICS_TITLE = 'Local Event Dashboard'
export const ANALYTICS_SUBTITLE =
  'Locallytics is storing events in your local MongoDB database inside this app. No external analytics service is required.'
export const BACK_TO_DASHBOARD_LABEL = 'Back to dashboard'
export const RECENT_EVENTS_TITLE = 'Recent Events'
export const RECENT_EVENTS_DESCRIPTION = 'Fresh event samples from the local analytics store.'
export const RECENT_EVENTS_EMPTY_STATE = 'No analytics have been tracked yet.'
export const GENERATED_AT_PREFIX = 'Generated'
export const SHOWING_PREFIX = 'Showing'
export const PREVIOUS_PAGE_LABEL = 'Previous'
export const NEXT_PAGE_LABEL = 'Next'
export const ANONYMOUS_USER_LABEL = 'anonymous'
export const MISSING_SESSION_LABEL = 'n/a'
export const MISSING_ROUTE_LABEL = '-'
export const RECENT_EVENTS_TABLE_HEADERS = ['Event', 'User', 'Session', 'Route', 'Time'] as const
export const OVERVIEW_METRICS: AdminAnalyticsMetricDefinition[] = [
  {
    key: 'totalEvents',
    label: 'Total events',
  },
  {
    key: 'uniqueVisitors',
    label: 'Unique visitors',
  },
  {
    key: 'pageViews',
    label: 'Page views',
  },
  {
    key: 'eventsLast24Hours',
    label: 'Last 24 hours',
  },
]
