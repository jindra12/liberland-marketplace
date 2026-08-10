'use client'

import React, { useState } from 'react'
import { toast } from '@payloadcms/ui'

type AiRepostResponse = {
  companiesScanned: number
  created: number
  skipped: boolean
  skippedReason: string | null
}

const AIRepostButtonContent = () => {
  const [loading, setLoading] = useState(false)

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()

    if (loading) {
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/cron/ai-reposts', {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to generate posts.')
      }

      const result = (await response.json()) as AiRepostResponse

      if (result.skipped) {
        toast.error(`Post generation skipped: ${result.skippedReason || 'Unknown reason.'}`)
        return
      }

      const postLabel = result.created === 1 ? 'post' : 'posts'
      toast.success(`Generated ${result.created} ${postLabel}.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate posts.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button aria-busy={loading} className="seedButton" disabled={loading} onClick={handleClick}>
      {loading ? 'Generating posts...' : 'Generate posts'}
    </button>
  )
}

export default AIRepostButtonContent
