import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AnalyticsTopItem } from '@/utilities/analytics/reporting'
import AnalyticsChartCard from './AnalyticsChartCard'
import { tooltipStyle, truncate } from './analyticsChartUtils'
import styles from './AnalyticsCharts.module.scss'

type Props = {
  topEvents: AnalyticsTopItem[]
}

const AnalyticsTopEventsChart = ({ topEvents }: Props) => {
  return (
    <AnalyticsChartCard
      description="Most frequent event types across the local analytics store."
      title="Top Events"
    >
      <div className={styles.chart}>
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={topEvents}>
            <CartesianGrid stroke="var(--theme-elevation-100)" strokeDasharray="3 3" />
            <XAxis dataKey="label" tickFormatter={(value: string) => truncate(value, 14)} />
            <YAxis allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" fill="#0f766e" name="Events" radius={[10, 10, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </AnalyticsChartCard>
  )
}

export default AnalyticsTopEventsChart
