'use client'

import React from 'react'

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
  const [Component, setComponent] = React.useState<null | React.ComponentType<PriceCellProps>>(null)

  React.useEffect(() => {
    let isMounted = true

    const loadPriceCell = async () => {
      try {
        const { PriceCell } = await import('@payloadcms/plugin-ecommerce/client')
        if (!isMounted) {
          return
        }

        React.startTransition(() => {
          setComponent(() => PriceCell)
        })
      } catch (error) {
        console.error('Failed to load ecommerce price cell.', error)
      }
    }

    loadPriceCell()

    return () => {
      isMounted = false
    }
  }, [])

  if (!Component) {
    return <span>{formatFallbackValue(props.cellData)}</span>
  }

  return <Component {...props} />
}
