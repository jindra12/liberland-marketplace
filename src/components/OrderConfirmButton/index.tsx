'use client'

import { useLazyLoad } from '@/components/hooks'

type OrderConfirmButtonModule = typeof import('./OrderConfirmButtonContent')

export default function OrderConfirmButton() {
  const Component = useLazyLoad<OrderConfirmButtonModule['default']>(
    async () => (await import('./OrderConfirmButtonContent')).default,
    'Failed to load order confirm button.',
  )

  if (!Component) {
    return null
  }

  return <Component />
}
