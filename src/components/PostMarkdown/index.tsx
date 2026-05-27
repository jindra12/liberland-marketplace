'use client'

import React from 'react'
import { cn } from '@/utilities/ui'

type Props = {
  className?: string
  source: string
}

const Markdown = React.lazy(async () => await import('./PostMarkdownContent'))

export const PostMarkdown = (props: Props) => {
  return (
    <React.Suspense fallback={<div className={cn('whitespace-pre-wrap', props.className)}>{props.source}</div>}>
      <Markdown className={props.className} source={props.source} />
    </React.Suspense>
  )
}
