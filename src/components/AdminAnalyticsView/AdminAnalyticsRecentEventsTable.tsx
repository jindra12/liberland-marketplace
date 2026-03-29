import {
  ANONYMOUS_USER_LABEL,
  MISSING_ROUTE_LABEL,
  MISSING_SESSION_LABEL,
  RECENT_EVENTS_TABLE_HEADERS,
} from './constants'
import styles from './index.module.scss'
import type { AdminAnalyticsRecentEventsTableProps } from './types'
import { formatTimestamp, getFrontendRouteHref } from './utils'

const AdminAnalyticsRecentEventsTable = ({
  events,
  frontendBaseURL,
}: AdminAnalyticsRecentEventsTableProps) => {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {RECENT_EVENTS_TABLE_HEADERS.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const routeHref = getFrontendRouteHref(frontendBaseURL, event.route)

            return (
              <tr key={event.id}>
                <td>{event.type}</td>
                <td>{event.userId ?? ANONYMOUS_USER_LABEL}</td>
                <td>{event.sessionId ?? MISSING_SESSION_LABEL}</td>
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
                    MISSING_ROUTE_LABEL
                  )}
                </td>
                <td>{formatTimestamp(event.timestamp)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default AdminAnalyticsRecentEventsTable
