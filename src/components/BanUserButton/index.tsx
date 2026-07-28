'use client'

import React, { Suspense } from 'react'

const BanUserButtonContent = React.lazy(async () => await import('./BanUserButtonContent'))

const BanUserButton = () => {
  return (
    <Suspense fallback={null}>
      <BanUserButtonContent />
    </Suspense>
  )
}

export default BanUserButton
