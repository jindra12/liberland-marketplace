import type {
  AnalyticsDashboardData,
  AnalyticsOverview,
  AnalyticsRecentEvent,
} from '@/utilities/analytics/reporting'

export type AdminAnalyticsHeaderProps = {
  backHref: string
}

export type AdminAnalyticsMetricDefinition = {
  key: keyof AnalyticsOverview
  label: string
}

export type AdminAnalyticsMetricCardProps = {
  label: string
  value: number
}

export type AdminAnalyticsMetricsProps = {
  overview: AnalyticsDashboardData['overview']
}

export type AdminAnalyticsPaginationProps = {
  currentPage: number
  totalPages: number
}

export type AdminAnalyticsRecentEventsPanelProps = {
  frontendBaseURL: null | string
  generatedAt: string
  rangeEnd: number
  rangeStart: number
  recentCurrentPage: number
  recentEvents: AnalyticsRecentEvent[]
  recentTotalDocs: number
  recentTotalPages: number
}

export type AdminAnalyticsRecentEventsTableProps = {
  events: AnalyticsRecentEvent[]
  frontendBaseURL: null | string
}

export type RecentEventsRange = {
  end: number
  start: number
}
