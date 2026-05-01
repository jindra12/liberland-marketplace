'use client'

import React, { useState } from 'react'
import { toast } from '@payloadcms/ui'

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
        throw new Error('Failed to run AI repost scan.')
      }

      toast.success('AI repost scan started.')
    } catch {
      toast.error('Failed to run AI repost scan.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button className="seedButton" disabled={loading} onClick={handleClick}>
      {loading ? 'Scanning AI reposts...' : 'Run AI repost scan'}
    </button>
  )
}

export default AIRepostButtonContent
