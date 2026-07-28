'use client'

import { PriceCell } from '@payloadcms/plugin-ecommerce/client'

type PriceCellProps = Parameters<
  (typeof import('@payloadcms/plugin-ecommerce/client'))['PriceCell']
>[0]

const PriceCellContent = (props: PriceCellProps) => {
  return <PriceCell {...props} />
}

export default PriceCellContent
