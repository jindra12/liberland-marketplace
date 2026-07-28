'use client'

import type { AnalyticsChartsProps } from './AnalyticsCharts.types'
import AnalyticsOperationChart from './AnalyticsOperationChart'
import AnalyticsTopEventsChart from './AnalyticsTopEventsChart'
import AnalyticsTopProductsChart from './AnalyticsTopProductsChart'
import AnalyticsTopRoutesChart from './AnalyticsTopRoutesChart'
import AnalyticsTrendChart from './AnalyticsTrendChart'
import styles from './AnalyticsCharts.module.scss'

const AnalyticsCharts = ({
  frontendBaseURL,
  topEvents,
  topMutations,
  topProducts,
  topQueries,
  topRoutes,
  trend,
}: AnalyticsChartsProps) => {
  return (
    <>
      <div className={styles.grid}>
        <AnalyticsTrendChart trend={trend} />
        <AnalyticsTopEventsChart topEvents={topEvents} />
        <AnalyticsTopRoutesChart frontendBaseURL={frontendBaseURL} topRoutes={topRoutes} />
      </div>

      <div className={styles.secondaryGrid}>
        <AnalyticsOperationChart
          data={topQueries}
          description="Most frequent GraphQL query operations seen by local analytics."
          emptyMessage="No GraphQL queries have been tracked yet."
          fill="#0f766e"
          name="Queries"
          title="Top Queries"
        />
        <AnalyticsOperationChart
          data={topMutations}
          description="Most frequent GraphQL mutation operations seen by local analytics."
          emptyMessage="No GraphQL mutations have been tracked yet."
          fill="#f97316"
          name="Mutations"
          title="Top Mutations"
        />
        <AnalyticsTopProductsChart topProducts={topProducts} />
      </div>
    </>
  )
}

export default AnalyticsCharts
