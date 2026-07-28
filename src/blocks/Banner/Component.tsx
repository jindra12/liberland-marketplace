import type { DefaultTypedEditorState } from '@payloadcms/richtext-lexical'

import { cn } from '@/utilities/ui'
import React from 'react'
import RichText from '@/components/RichText'

type BannerBlockProps = {
  content: DefaultTypedEditorState
  style: 'error' | 'info' | 'success' | 'warning'
}

type Props = BannerBlockProps & {
  className?: string
}

export const BannerBlock: React.FC<Props> = (props) => {
  return (
    <div className={cn('mx-auto my-8 w-full', props.className)}>
      <div
        className={cn('border py-3 px-6 flex items-center rounded', {
          'border-border bg-card': props.style === 'info',
          'border-error bg-error/30': props.style === 'error',
          'border-success bg-success/30': props.style === 'success',
          'border-warning bg-warning/30': props.style === 'warning',
        })}
      >
        <RichText data={props.content} enableGutter={false} enableProse={false} />
      </div>
    </div>
  )
}
