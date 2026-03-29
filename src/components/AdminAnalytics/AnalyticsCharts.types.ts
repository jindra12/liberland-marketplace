import type { AnalyticsDailyPoint, AnalyticsTopItem } from '@/utilities/analytics/reporting'

export type AnalyticsChartsProps = {
  frontendBaseURL: null | string
  topEvents: AnalyticsTopItem[]
  topMutations: AnalyticsTopItem[]
  topQueries: AnalyticsTopItem[]
  topRoutes: AnalyticsTopItem[]
  trend: AnalyticsDailyPoint[]
}
