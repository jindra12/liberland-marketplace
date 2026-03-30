'use client'

import type { ComponentType } from 'react'
import { useLazyLoad } from '@/components/hooks'

type PriceCellProps = Parameters<(typeof import('@payloadcms/plugin-ecommerce/client'))['PriceCell']>[0]

const formatFallbackValue = (value: PriceCellProps['cellData']): string => {
  if (typeof value === 'number') {
    return value.toLocaleString()
  }

  if (typeof value === 'string') {
    return value
  }

  return ''
}

export default function PriceCell(props: PriceCellProps) {
  const Component = useLazyLoad<ComponentType<PriceCellProps>>(
    async () => (await import('@payloadcms/plugin-ecommerce/client')).PriceCell,
    'Failed to load ecommerce price cell.',
  )

  if (!Component) {
    return <span>{formatFallbackValue(props.cellData)}</span>
  }

  return <Component {...props} />
}
