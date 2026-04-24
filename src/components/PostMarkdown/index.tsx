'use client'

import React from 'react'

import { useLazyLoad } from '@/components/hooks'
import { cn } from '@/utilities/ui'

type Props = {
  className?: string
  source: string
}

export const PostMarkdown = (props: Props) => {
  const markdownEditorModule = useLazyLoad(
    () => import('@uiw/react-md-editor/nohighlight'),
    'Failed to load markdown preview module.',
  )

  const Markdown = markdownEditorModule?.default.Markdown

  if (!markdownEditorModule || !Markdown) {
    return <div className={cn('whitespace-pre-wrap', props.className)}>{props.source}</div>
  }

  return <Markdown className={props.className} source={props.source} />
}

