import AdminAnalyticsMetricCard from './AdminAnalyticsMetricCard'
import { OVERVIEW_METRICS } from './constants'
import styles from './index.module.scss'
import type { AdminAnalyticsMetricsProps } from './types'

const AdminAnalyticsMetrics = ({ overview }: AdminAnalyticsMetricsProps) => {
  return (
    <section className={styles.metrics}>
      {OVERVIEW_METRICS.map((metric) => (
        <AdminAnalyticsMetricCard
          key={metric.key}
          label={metric.label}
          value={overview[metric.key]}
        />
      ))}
    </section>
  )
}

export default AdminAnalyticsMetrics
