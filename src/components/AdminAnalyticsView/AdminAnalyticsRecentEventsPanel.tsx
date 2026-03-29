import AdminAnalyticsPagination from './AdminAnalyticsPagination'
import AdminAnalyticsRecentEventsTable from './AdminAnalyticsRecentEventsTable'
import {
  GENERATED_AT_PREFIX,
  RECENT_EVENTS_DESCRIPTION,
  RECENT_EVENTS_EMPTY_STATE,
  RECENT_EVENTS_TITLE,
  SHOWING_PREFIX,
} from './constants'
import styles from './index.module.scss'
import type { AdminAnalyticsRecentEventsPanelProps } from './types'

const AdminAnalyticsRecentEventsPanel = ({
  frontendBaseURL,
  generatedAt,
  rangeEnd,
  rangeStart,
  recentCurrentPage,
  recentEvents,
  recentTotalDocs,
  recentTotalPages,
}: AdminAnalyticsRecentEventsPanelProps) => {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>{RECENT_EVENTS_TITLE}</h2>
          <p>{RECENT_EVENTS_DESCRIPTION}</p>
        </div>
        <div className={styles.panelMeta}>
          <span className={styles.generatedAt}>
            {GENERATED_AT_PREFIX} {new Date(generatedAt).toLocaleString()}
          </span>
          <span className={styles.generatedAt}>
            {SHOWING_PREFIX} {rangeStart}-{rangeEnd} of {recentTotalDocs.toLocaleString()}
          </span>
        </div>
      </div>

      {recentEvents.length === 0 ? (
        <p className={styles.emptyState}>{RECENT_EVENTS_EMPTY_STATE}</p>
      ) : (
        <AdminAnalyticsRecentEventsTable
          events={recentEvents}
          frontendBaseURL={frontendBaseURL}
        />
      )}

      {recentTotalPages > 1 ? (
        <AdminAnalyticsPagination currentPage={recentCurrentPage} totalPages={recentTotalPages} />
      ) : null}
    </section>
  )
}

export default AdminAnalyticsRecentEventsPanel
