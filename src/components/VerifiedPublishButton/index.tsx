'use client'

import React, { Suspense } from 'react'

const VerifiedPublishButtonContent = React.lazy(
  async () => await import('./VerifiedPublishButtonContent'),
)

export default function VerifiedPublishButton() {
  return (
    <Suspense
      fallback={
        <button type="button" disabled className="btn btn--style-primary btn--size-medium">
          Publish
        </button>
      }
    >
      <VerifiedPublishButtonContent />
    </Suspense>
  )
}
