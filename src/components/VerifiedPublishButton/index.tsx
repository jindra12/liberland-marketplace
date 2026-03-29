'use client'

import { useLazyLoad } from '@/components/hooks'

type VerifiedPublishButtonModule = typeof import('./VerifiedPublishButtonContent')

export default function VerifiedPublishButton() {
  const Component = useLazyLoad<VerifiedPublishButtonModule['default']>(
    async () => (await import('./VerifiedPublishButtonContent')).default,
    'Failed to load verified publish button.',
  )

  if (!Component) {
    return (
      <button type="button" disabled className="btn btn--style-primary btn--size-medium">
        Publish
      </button>
    )
  }

  return <Component />
}
