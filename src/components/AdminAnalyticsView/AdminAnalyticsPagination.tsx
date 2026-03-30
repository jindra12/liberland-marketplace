import Link from 'next/link'
import { NEXT_PAGE_LABEL, PREVIOUS_PAGE_LABEL } from './constants'
import styles from './index.module.scss'
import type { AdminAnalyticsPaginationProps } from './types'
import { getEventsPageHref } from './utils'

const AdminAnalyticsPagination = ({
  currentPage,
  totalPages,
}: AdminAnalyticsPaginationProps) => {
  return (
    <nav aria-label="Recent events pagination" className={styles.pagination}>
      {currentPage > 1 ? (
        <Link className={styles.paginationLink} href={getEventsPageHref(currentPage - 1)}>
          {PREVIOUS_PAGE_LABEL}
        </Link>
      ) : (
        <span className={styles.paginationLinkDisabled}>{PREVIOUS_PAGE_LABEL}</span>
      )}

      <span className={styles.paginationSummary}>
        Page {currentPage} of {totalPages}
      </span>

      {currentPage < totalPages ? (
        <Link className={styles.paginationLink} href={getEventsPageHref(currentPage + 1)}>
          {NEXT_PAGE_LABEL}
        </Link>
      ) : (
        <span className={styles.paginationLinkDisabled}>{NEXT_PAGE_LABEL}</span>
      )}
    </nav>
  )
}

export default AdminAnalyticsPagination
