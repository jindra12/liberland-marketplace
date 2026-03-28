'use client'

import React from 'react'

type OrderConfirmButtonModule = typeof import('./OrderConfirmButtonContent')

export default function OrderConfirmButton() {
  const [Component, setComponent] =
    React.useState<OrderConfirmButtonModule['default'] | null>(null)

  React.useEffect(() => {
    let isMounted = true

    const loadOrderConfirmButton = async () => {
      try {
        const { default: d } = await import('./OrderConfirmButtonContent')
        if (!isMounted) {
          return
        }

        React.startTransition(() => {
          setComponent(() => d)
        })
      } catch (error) {
        console.error('Failed to load order confirm button.', error)
      }
    }

    loadOrderConfirmButton()

    return () => {
      isMounted = false
    }
  }, [])

  if (!Component) {
    return null
  }

  return <Component />
}
