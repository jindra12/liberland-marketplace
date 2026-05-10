'use client'

import { useLazyLoad } from '@/components/hooks'

type BanUserButtonModule = typeof import('./BanUserButtonContent')

const BanUserButton = () => {
  const Component = useLazyLoad<BanUserButtonModule['default']>(
    async () => (await import('./BanUserButtonContent')).default,
    'Failed to load ban user button.',
  )

  if (!Component) {
    return null
  }

  return <Component />
}

export default BanUserButton
