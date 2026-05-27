'use client'

import React, { Suspense } from 'react'

const OrderConfirmButtonContent = React.lazy(
  async () => await import('./OrderConfirmButtonContent'),
)

export default function OrderConfirmButton() {
  return (
    <Suspense fallback={null}>
      <OrderConfirmButtonContent />
    </Suspense>
  )
}
