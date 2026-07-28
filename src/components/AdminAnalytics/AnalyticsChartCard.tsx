import type { ReactNode } from 'react'
import styles from './AnalyticsCharts.module.scss'

type Props = {
  children: ReactNode
  description: string
  title: string
}

const AnalyticsChartCard = ({ children, description, title }: Props) => {
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children}
    </section>
  )
}

export default AnalyticsChartCard
