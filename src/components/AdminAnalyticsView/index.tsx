import type { AdminViewServerProps } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import AnalyticsCharts from '@/components/AdminAnalytics/AnalyticsCharts'
import { getAnalyticsDashboardData } from '@/utilities/analytics/reporting'
import styles from './index.module.scss'

const isAdmin = (role: null | string | string[] | undefined) => {
  if (Array.isArray(role)) {
    return role.includes('admin')
  }

  return role?.includes('admin') || false
}

const formatTimestamp = (value: number) =>
  new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value))

const parseEventsPage = (value: string | string[] | undefined) => {
  const candidate = Array.isArray(value) ? value[0] : value
  const parsed = Number(candidate)

  if (!Number.isInteger(parsed) || parsed < 1) {
    return 1
  }

  return parsed
}

const getEventsPageHref = (page: number) => `/admin/analytics?eventsPage=${page}`

const getFrontendRouteHref = (route: null | string) => {
  const baseURL = process.env.FRONTEND_URL

  if (!baseURL || !route) {
    return null
  }

  const normalizedBaseURL = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL
  const normalizedRoute = route.startsWith('/') ? route : `/${route}`

  return `${normalizedBaseURL}${normalizedRoute}`
}

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
    redirect('/admin/login')
  }

  if (!isAdmin(adminUser.role)) {
    redirect('/admin')
  }

  const requestedEventsPage = parseEventsPage(searchParams?.eventsPage)
  const analytics = await getAnalyticsDashboardData({
    recentPage: requestedEventsPage,
  })
  const frontendBaseURL = process.env.FRONTEND_URL ?? null
  const recentRangeStart =
    analytics.recentTotalDocs === 0
      ? 0
      : (analytics.recentCurrentPage - 1) * analytics.recentLimit + 1
  const recentRangeEnd =
    analytics.recentTotalDocs === 0
      ? 0
      : recentRangeStart + analytics.recentEvents.length - 1

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
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Analytics</p>
            <h1>Local Event Dashboard</h1>
            <p className={styles.subtitle}>
              Locallytics is storing events in your local MongoDB database inside this app. No
              external analytics service is required.
            </p>
          </div>
          <div className={styles.headerActions}>
            <Link className={styles.linkButton} href="/admin">
              Back to dashboard
            </Link>
          </div>
        </header>

        <section className={styles.metrics}>
          <article className={styles.metricCard}>
            <span>Total events</span>
            <strong>{analytics.overview.totalEvents.toLocaleString()}</strong>
          </article>
          <article className={styles.metricCard}>
            <span>Unique visitors</span>
            <strong>{analytics.overview.uniqueVisitors.toLocaleString()}</strong>
          </article>
          <article className={styles.metricCard}>
            <span>Page views</span>
            <strong>{analytics.overview.pageViews.toLocaleString()}</strong>
          </article>
          <article className={styles.metricCard}>
            <span>Last 24 hours</span>
            <strong>{analytics.overview.eventsLast24Hours.toLocaleString()}</strong>
          </article>
        </section>

        <AnalyticsCharts
          frontendBaseURL={frontendBaseURL}
          topEvents={analytics.topEvents}
          topMutations={analytics.topMutations}
          topQueries={analytics.topQueries}
          topRoutes={analytics.topRoutes}
          trend={analytics.trend}
        />

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Recent Events</h2>
              <p>Fresh event samples from the local analytics store.</p>
            </div>
            <div className={styles.panelMeta}>
              <span className={styles.generatedAt}>
                Generated {new Date(analytics.generatedAt).toLocaleString()}
              </span>
              <span className={styles.generatedAt}>
                Showing {recentRangeStart}-{recentRangeEnd} of{' '}
                {analytics.recentTotalDocs.toLocaleString()}
              </span>
            </div>
          </div>

          {analytics.recentEvents.length === 0 ? (
            <p className={styles.emptyState}>No analytics have been tracked yet.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>User</th>
                    <th>Session</th>
                    <th>Route</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.recentEvents.map((event) => {
                    const routeHref = getFrontendRouteHref(event.route)

                    return (
                      <tr key={event.id}>
                        <td>{event.type}</td>
                        <td>{event.userId ?? 'anonymous'}</td>
                        <td>{event.sessionId ?? 'n/a'}</td>
                        <td>
                          {event.route ? (
                            routeHref ? (
                              <a
                                className={styles.routeLink}
                                href={routeHref}
                                rel="noreferrer"
                                target="_blank"
                              >
                                {event.route}
                              </a>
                            ) : (
                              event.route
                            )
                          ) : (
                            '-'
                          )}
                        </td>
                        <td>{formatTimestamp(event.timestamp)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {analytics.recentTotalPages > 1 && (
            <nav aria-label="Recent events pagination" className={styles.pagination}>
              {analytics.recentCurrentPage > 1 ? (
                <Link
                  className={styles.paginationLink}
                  href={getEventsPageHref(analytics.recentCurrentPage - 1)}
                >
                  Previous
                </Link>
              ) : (
                <span className={styles.paginationLinkDisabled}>Previous</span>
              )}

              <span className={styles.paginationSummary}>
                Page {analytics.recentCurrentPage} of {analytics.recentTotalPages}
              </span>

              {analytics.recentCurrentPage < analytics.recentTotalPages ? (
                <Link
                  className={styles.paginationLink}
                  href={getEventsPageHref(analytics.recentCurrentPage + 1)}
                >
                  Next
                </Link>
              ) : (
                <span className={styles.paginationLinkDisabled}>Next</span>
              )}
            </nav>
          )}
        </section>
      </div>
    </DefaultTemplate>
  )
}

export default AdminAnalyticsView
