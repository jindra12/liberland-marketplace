import type { AnalyticsTopItem } from '@/utilities/analytics/reporting'
import AnalyticsOperationChart from './AnalyticsOperationChart'

type Props = {
  topProducts: AnalyticsTopItem[]
}

const AnalyticsTopProductsChart = ({ topProducts }: Props) => {
  return (
    <AnalyticsOperationChart
      data={topProducts}
      description="Most purchased products based on tracked CreateOrder mutation inputs."
      emptyMessage="No CreateOrder mutations have been tracked yet."
      fill="#2563eb"
      name="Units"
      title="Most Purchased Products"
    />
  )
}

export default AnalyticsTopProductsChart
