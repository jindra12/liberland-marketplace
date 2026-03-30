'use client'

import React from 'react'

export const useLazyLoad = <T,>(
  load: () => Promise<T>,
  errorMessage = 'Failed to lazy load module.',
): null | T => {
  const [value, setValue] = React.useState<T | null>(null)
  const loadRef = React.useRef(load)

  loadRef.current = load

  React.useEffect(() => {
    let isMounted = true

    const loadValue = async () => {
      try {
        const nextValue = await loadRef.current()

        if (!isMounted) {
          return
        }

        React.startTransition(() => {
          setValue(nextValue)
        })
      } catch (error) {
        console.error(errorMessage, error)
      }
    }

    loadValue()

    return () => {
      isMounted = false
    }
  }, [errorMessage])

  return value
}
