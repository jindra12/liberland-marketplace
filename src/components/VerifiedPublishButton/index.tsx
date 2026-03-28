'use client'

import React from 'react'

type VerifiedPublishButtonModule = typeof import('./VerifiedPublishButtonContent')

export default function VerifiedPublishButton() {
  const [Component, setComponent] =
    React.useState<VerifiedPublishButtonModule['default'] | null>(null)

  React.useEffect(() => {
    let isMounted = true

    const loadVerifiedPublishButton = async () => {
      try {
        const { default: d } = await import('./VerifiedPublishButtonContent')
        if (!isMounted) {
          return
        }

        React.startTransition(() => {
          setComponent(() => d)
        })
      } catch (error) {
        console.error('Failed to load verified publish button.', error)
      }
    }

    loadVerifiedPublishButton()

    return () => {
      isMounted = false
    }
  }, [])

  if (!Component) {
    return (
      <button type="button" disabled className="btn btn--style-primary btn--size-medium">
        Publish
      </button>
    )
  }

  return <Component />
}
