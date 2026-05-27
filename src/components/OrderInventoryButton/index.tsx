'use client'

import React, { Suspense } from 'react'

const OrderInventoryButtonContent = React.lazy(
  async () => await import('./OrderInventoryButtonContent'),
)

const OrderInventoryButton = () => {
  return (
    <Suspense fallback={null}>
      <OrderInventoryButtonContent />
    </Suspense>
  )
}

export default OrderInventoryButton
