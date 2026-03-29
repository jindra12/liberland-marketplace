import type { AdminViewServerProps } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { redirect } from 'next/navigation'
import AnalyticsCharts from '@/components/AdminAnalytics/AnalyticsCharts'
import { getAnalyticsDashboardData } from '@/utilities/analytics/reporting'
import AdminAnalyticsHeader from './AdminAnalyticsHeader'
import AdminAnalyticsMetrics from './AdminAnalyticsMetrics'
import AdminAnalyticsRecentEventsPanel from './AdminAnalyticsRecentEventsPanel'
import { ADMIN_DASHBOARD_HREF, ADMIN_LOGIN_HREF } from './constants'
import styles from './index.module.scss'
import { getRecentEventsRange, isAdmin, parseEventsPage } from './utils'

const AdminAnalyticsView = async ({
  initPageResult,
  params,
  searchParams,
  user,
  viewActions,
  viewType,
}: AdminViewServerProps) => {
  const adminUser = initPageResult.req.user ?? user

  if (!adminUser) {
    redirect(ADMIN_LOGIN_HREF)
  }

  if (!isAdmin(adminUser.role)) {
    redirect(ADMIN_DASHBOARD_HREF)
  }

  const requestedEventsPage = parseEventsPage(searchParams?.eventsPage)
  const analytics = await getAnalyticsDashboardData({
    recentPage: requestedEventsPage,
  })
  const frontendBaseURL = process.env.FRONTEND_URL ?? null
  const { end: recentRangeEnd, start: recentRangeStart } = getRecentEventsRange(analytics)

  return (
    <DefaultTemplate
      i18n={initPageResult.req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={initPageResult.req.payload}
      permissions={initPageResult.permissions}
      req={initPageResult.req}
      searchParams={searchParams}
      user={adminUser}
      viewActions={viewActions}
      viewType={viewType ?? 'dashboard'}
      visibleEntities={{
        collections: initPageResult.visibleEntities.collections,
        globals: initPageResult.visibleEntities.globals,
      }}
    >
      <div className={styles.page}>
        <AdminAnalyticsHeader backHref={ADMIN_DASHBOARD_HREF} />
        <AdminAnalyticsMetrics overview={analytics.overview} />

        <AnalyticsCharts
          frontendBaseURL={frontendBaseURL}
          topEvents={analytics.topEvents}
          topMutations={analytics.topMutations}
          topQueries={analytics.topQueries}
          topRoutes={analytics.topRoutes}
          trend={analytics.trend}
        />
        <AdminAnalyticsRecentEventsPanel
          frontendBaseURL={frontendBaseURL}
          generatedAt={analytics.generatedAt}
          rangeEnd={recentRangeEnd}
          rangeStart={recentRangeStart}
          recentCurrentPage={analytics.recentCurrentPage}
          recentEvents={analytics.recentEvents}
          recentTotalDocs={analytics.recentTotalDocs}
          recentTotalPages={analytics.recentTotalPages}
        />
      </div>
    </DefaultTemplate>
  )
}

export default AdminAnalyticsView
