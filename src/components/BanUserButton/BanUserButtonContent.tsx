'use client'

import { useState } from 'react'

import { toast, useDocumentInfo } from '@payloadcms/ui'

const toDocID = (value: unknown): string | null => {
  if (typeof value === 'string' || typeof value === 'number') {
    const id = String(value)
    return id.length > 0 ? id : null
  }

  return null
}

const BanUserButtonContent = () => {
  const { id } = useDocumentInfo()
  const [loading, setLoading] = useState(false)
  const userID = toDocID(id)

  const handleBanUser = async () => {
    if (!userID || loading) {
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`/api/users/${userID}`, {
        body: JSON.stringify({
          banned: true,
        }),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      })

      const body = (await response.json().catch(() => null)) as { error?: string } | null

      if (!response.ok) {
        throw new Error(body?.error || 'Failed to ban user.')
      }

      toast.success('User banned successfully.')
      window.location.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to ban user.')
    } finally {
      setLoading(false)
    }
  }

  if (!userID) {
    return null
  }

  return (
    <button
      type="button"
      className="btn btn--style-primary btn--size-medium"
      disabled={loading}
      onClick={handleBanUser}
    >
      {loading ? 'Banning...' : 'Ban user'}
    </button>
  )
}

export default BanUserButtonContent
