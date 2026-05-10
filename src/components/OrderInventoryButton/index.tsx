'use client'

import { useLazyLoad } from '@/components/hooks'

type OrderInventoryButtonModule = typeof import('./OrderInventoryButtonContent')

const OrderInventoryButton = () => {
  const Component = useLazyLoad<OrderInventoryButtonModule['default']>(
    async () => (await import('./OrderInventoryButtonContent')).default,
    'Failed to load order inventory button.',
  )

  if (!Component) {
    return null
  }

  return <Component />
}

export default OrderInventoryButton
