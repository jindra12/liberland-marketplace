'use client'

import React, { Suspense } from 'react'

type PriceCellProps = Parameters<
  (typeof import('@payloadcms/plugin-ecommerce/client'))['PriceCell']
>[0]
const PriceCellContent = React.lazy(async () => await import('./PriceCellContent'))

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
  return (
    <Suspense fallback={<span>{formatFallbackValue(props.cellData)}</span>}>
      <PriceCellContent {...props} />
    </Suspense>
  )
}
