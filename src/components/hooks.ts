'use client'

import React from 'react'

export const useLazyLoad = <T,>(
  load: () => Promise<T>,
  errorMessage = 'Failed to lazy load module.',
): null | T => {
  const loadRef = React.useRef<T | null>(null)

  React.useEffect(() => {
    (async () => {
      try {
        loadRef.current = await load()
      } catch (e) {
        console.error(errorMessage, e)
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return loadRef.current
}
