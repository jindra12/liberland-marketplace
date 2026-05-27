'use client'

import React, { Suspense } from 'react'

const AIRepostButtonContent = React.lazy(async () => await import('./AIRepostButtonContent'))

const AIRepostButton = () => {
  return (
    <Suspense fallback={null}>
      <AIRepostButtonContent />
    </Suspense>
  )
}

export default AIRepostButton
