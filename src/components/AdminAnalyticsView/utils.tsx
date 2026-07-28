import type { AnalyticsDashboardData } from '@/utilities/analytics/reporting'
import { ADMIN_ANALYTICS_HREF, DEFAULT_EVENTS_PAGE } from './constants'
import type { RecentEventsRange } from './types'

export const isAdmin = (role: null | string | string[] | undefined) => {
  if (Array.isArray(role)) {
    return role.includes('admin')
  }

  return role?.includes('admin') || false
}

export const formatTimestamp = (value: number) =>
  new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value))

export const parseEventsPage = (value: string | string[] | undefined) => {
  const candidate = Array.isArray(value) ? value[0] : value
  const parsed = Number(candidate)

  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_EVENTS_PAGE
  }

  return parsed
}

export const getEventsPageHref = (page: number) => `${ADMIN_ANALYTICS_HREF}?eventsPage=${page}`

export const getFrontendRouteHref = (frontendBaseURL: null | string, route: null | string) => {
  if (!frontendBaseURL || !route) {
    return null
  }

  const normalizedBaseURL = frontendBaseURL.endsWith('/')
    ? frontendBaseURL.slice(0, -1)
    : frontendBaseURL
  const normalizedRoute = route.startsWith('/') ? route : `/${route}`

  return `${normalizedBaseURL}${normalizedRoute}`
}

export const getRecentEventsRange = (
  analytics: Pick<
    AnalyticsDashboardData,
    'recentCurrentPage' | 'recentEvents' | 'recentLimit' | 'recentTotalDocs'
  >,
): RecentEventsRange => {
  if (analytics.recentTotalDocs === 0) {
    return {
      end: 0,
      start: 0,
    }
  }

  const start = (analytics.recentCurrentPage - 1) * analytics.recentLimit + 1

  return {
    end: start + analytics.recentEvents.length - 1,
    start,
  }
}
