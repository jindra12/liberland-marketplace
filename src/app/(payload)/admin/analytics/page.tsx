import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import AnalyticsCharts from '@/components/AdminAnalytics/AnalyticsCharts'
import { getAnalyticsDashboardData } from '@/utilities/analytics/reporting'
import styles from './page.module.scss'

export const metadata: Metadata = {
  title: 'Analytics',
}

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

type Args = {
  searchParams: Promise<{
    eventsPage?: string | string[]
  }>
}

export default async function AnalyticsAdminPage({ searchParams: searchParamsPromise }: Args) {
  const payload = await getPayload({ config })
  const requestHeaders = await headers()
  const { user } = await payload.auth({ headers: requestHeaders })
  const searchParams = await searchParamsPromise

  if (!user) {
    redirect('/admin/login')
  }

  if (!isAdmin(user.role)) {
    redirect('/admin')
  }

  const requestedEventsPage = parseEventsPage(searchParams.eventsPage)
  const analytics = await getAnalyticsDashboardData({
    recentPage: requestedEventsPage,
  })
  const recentRangeStart =
    analytics.recentTotalDocs === 0
      ? 0
      : (analytics.recentCurrentPage - 1) * analytics.recentLimit + 1
  const recentRangeEnd =
    analytics.recentTotalDocs === 0
      ? 0
      : recentRangeStart + analytics.recentEvents.length - 1

  return (
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
        topEvents={analytics.topEvents}
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
                {analytics.recentEvents.map((event) => (
                  <tr key={event.id}>
                    <td>{event.type}</td>
                    <td>{event.userId ?? 'anonymous'}</td>
                    <td>{event.sessionId ?? 'n/a'}</td>
                    <td>{event.route ?? '-'}</td>
                    <td>{formatTimestamp(event.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {analytics.recentTotalPages > 1 && (
          <nav aria-label="Recent events pagination" className={styles.pagination}>
            {analytics.recentCurrentPage > 1 ? (
              <Link className={styles.paginationLink} href={getEventsPageHref(analytics.recentCurrentPage - 1)}>
                Previous
              </Link>
            ) : (
              <span className={styles.paginationLinkDisabled}>Previous</span>
            )}

            <span className={styles.paginationSummary}>
              Page {analytics.recentCurrentPage} of {analytics.recentTotalPages}
            </span>

            {analytics.recentCurrentPage < analytics.recentTotalPages ? (
              <Link className={styles.paginationLink} href={getEventsPageHref(analytics.recentCurrentPage + 1)}>
                Next
              </Link>
            ) : (
              <span className={styles.paginationLinkDisabled}>Next</span>
            )}
          </nav>
        )}
      </section>
    </div>
  )
}
