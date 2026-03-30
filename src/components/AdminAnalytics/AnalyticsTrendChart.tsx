import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AnalyticsDailyPoint } from '@/utilities/analytics/reporting'
import AnalyticsChartCard from './AnalyticsChartCard'
import { tooltipStyle } from './analyticsChartUtils'
import styles from './AnalyticsCharts.module.scss'

type Props = {
  trend: AnalyticsDailyPoint[]
}

const AnalyticsTrendChart = ({ trend }: Props) => {
  return (
    <AnalyticsChartCard
      description="Daily totals for all tracked events and page views."
      title="Event Volume"
    >
      <div className={styles.chart}>
        <ResponsiveContainer height="100%" width="100%">
          <AreaChart data={trend}>
            <defs>
              <linearGradient id="analytics-total" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="#0f766e" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#0f766e" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="analytics-pageviews" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--theme-elevation-100)" strokeDasharray="3 3" />
            <XAxis dataKey="day" tickFormatter={(value: string) => value.slice(5)} />
            <YAxis allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area
              dataKey="total"
              fill="url(#analytics-total)"
              fillOpacity={1}
              name="All events"
              stroke="#0f766e"
              strokeWidth={2}
              type="monotone"
            />
            <Area
              dataKey="pageViews"
              fill="url(#analytics-pageviews)"
              fillOpacity={1}
              name="Page views"
              stroke="#f97316"
              strokeWidth={2}
              type="monotone"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </AnalyticsChartCard>
  )
}

export default AnalyticsTrendChart
