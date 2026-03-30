import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AnalyticsTopItem } from '@/utilities/analytics/reporting'
import AnalyticsChartCard from './AnalyticsChartCard'
import { tooltipStyle, truncate } from './analyticsChartUtils'
import styles from './AnalyticsCharts.module.scss'

type Props = {
  data: AnalyticsTopItem[]
  description: string
  emptyMessage: string
  fill: string
  name: string
  title: string
}

const AnalyticsOperationChart = ({
  data,
  description,
  emptyMessage,
  fill,
  name,
  title,
}: Props) => {
  return (
    <AnalyticsChartCard description={description} title={title}>
      {data.length === 0 ? (
        <div className={styles.emptyChart}>{emptyMessage}</div>
      ) : (
        <div className={styles.chart}>
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12 }}>
              <CartesianGrid stroke="var(--theme-elevation-100)" strokeDasharray="3 3" />
              <XAxis allowDecimals={false} type="number" />
              <YAxis
                dataKey="label"
                tickFormatter={(value: string) => truncate(value, 28)}
                type="category"
                width={180}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill={fill} name={name} radius={[0, 10, 10, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </AnalyticsChartCard>
  )
}

export default AnalyticsOperationChart
