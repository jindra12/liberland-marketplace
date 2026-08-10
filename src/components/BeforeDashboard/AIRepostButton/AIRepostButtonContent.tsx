'use client'

import React, { useState } from 'react'
import { toast, useAuth } from '@payloadcms/ui'

import type { User } from '@/payload-types'

type AiRepostResponse = {
  companiesScanned: number
  created: number
  error?: string
  skipped: boolean
  skippedReason: string | null
}

const AIRepostButtonContent = () => {
  const { user } = useAuth<User>()
  const [loading, setLoading] = useState(false)

  if (!user?.role?.includes('admin')) {
    return null
  }

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

      const result = (await response.json()) as AiRepostResponse

      if (!response.ok) {
        throw new Error(result.error || `Post generation failed with status ${response.status}.`)
      }

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
    <button
      aria-busy={loading}
      className="before-dashboard__ai-button"
      disabled={loading}
      onClick={handleClick}
      type="button"
    >
      {loading ? 'Generating posts...' : 'Generate posts'}
    </button>
  )
}

export default AIRepostButtonContent
