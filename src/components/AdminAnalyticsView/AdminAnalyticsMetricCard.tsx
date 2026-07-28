import styles from './index.module.scss'
import type { AdminAnalyticsMetricCardProps } from './types'

const AdminAnalyticsMetricCard = ({ label, value }: AdminAnalyticsMetricCardProps) => {
  return (
    <article className={styles.metricCard}>
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </article>
  )
}

export default AdminAnalyticsMetricCard
