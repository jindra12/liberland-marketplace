'use client'

import { useLazyLoad } from '@/components/hooks'

type AIRepostButtonModule = typeof import('./AIRepostButtonContent')

const AIRepostButton = () => {
  const Component = useLazyLoad<AIRepostButtonModule['default']>(
    async () => (await import('./AIRepostButtonContent')).default,
    'Failed to load AI repost button.',
  )

  if (!Component) {
    return null
  }

  return <Component />
}

export default AIRepostButton
