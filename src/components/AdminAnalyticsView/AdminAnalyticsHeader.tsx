import Link from 'next/link'
import {
  ANALYTICS_EYEBROW,
  ANALYTICS_SUBTITLE,
  ANALYTICS_TITLE,
  BACK_TO_DASHBOARD_LABEL,
} from './constants'
import styles from './index.module.scss'
import type { AdminAnalyticsHeaderProps } from './types'

const AdminAnalyticsHeader = ({ backHref }: AdminAnalyticsHeaderProps) => {
  return (
    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}>{ANALYTICS_EYEBROW}</p>
        <h1>{ANALYTICS_TITLE}</h1>
        <p className={styles.subtitle}>{ANALYTICS_SUBTITLE}</p>
      </div>
      <div className={styles.headerActions}>
        <Link className={styles.linkButton} href={backHref}>
          {BACK_TO_DASHBOARD_LABEL}
        </Link>
      </div>
    </header>
  )
}

export default AdminAnalyticsHeader
