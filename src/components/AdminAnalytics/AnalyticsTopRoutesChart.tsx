import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AnalyticsTopItem } from '@/utilities/analytics/reporting'
import AnalyticsChartCard from './AnalyticsChartCard'
import AnalyticsRouteTick from './AnalyticsRouteTick'
import { tooltipStyle } from './analyticsChartUtils'
import styles from './AnalyticsCharts.module.scss'

type Props = {
  frontendBaseURL: null | string
  topRoutes: AnalyticsTopItem[]
}

const AnalyticsTopRoutesChart = ({ frontendBaseURL, topRoutes }: Props) => {
  return (
    <AnalyticsChartCard
      description="Most viewed routes from incoming `page_view` events."
      title="Top Routes"
    >
      {topRoutes.length === 0 ? (
        <div className={styles.emptyChart}>No page-view routes have been tracked yet.</div>
      ) : (
        <div className={styles.chart}>
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={topRoutes} layout="vertical" margin={{ left: 8, right: 12 }}>
              <CartesianGrid stroke="var(--theme-elevation-100)" strokeDasharray="3 3" />
              <XAxis allowDecimals={false} type="number" />
              <YAxis
                dataKey="label"
                tick={(props) => (
                  <AnalyticsRouteTick
                    frontendBaseURL={frontendBaseURL}
                    payload={props.payload}
                    x={props.x}
                    y={props.y}
                  />
                )}
                type="category"
                width={180}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill="#1d4ed8" name="Page views" radius={[0, 10, 10, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </AnalyticsChartCard>
  )
}

export default AnalyticsTopRoutesChart
