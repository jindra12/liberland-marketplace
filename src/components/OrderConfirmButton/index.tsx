'use client'

import React, { useCallback, useState } from 'react'
import { useDocumentInfo, toast } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'

const toDocID = (value: unknown): string | null => {
  if (typeof value === 'string' || typeof value === 'number') {
    const id = String(value).trim()
    return id.length > 0 ? id : null
  }

  return null
}

export default function OrderConfirmButton() {
  const router = useRouter()
  const { id } = useDocumentInfo()
  const [loading, setLoading] = useState(false)

  const orderID = toDocID(id)

  const handleConfirm = useCallback(async () => {
    if (!orderID || loading) {
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`/api/orders/${orderID}/confirm-crypto`, {
        method: 'POST',
        credentials: 'include',
      })

      const body = (await response.json().catch(() => null)) as { error?: string } | null

      if (!response.ok) {
        throw new Error(body?.error || 'Failed to confirm crypto order.')
      }

      toast.success('Order confirmed successfully.')
      try {
        router.refresh()
      } catch {
        window.location.reload()
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to confirm crypto order.')
    } finally {
      setLoading(false)
    }
  }, [loading, orderID, router])

  if (!orderID) {
    return null
  }

  return (
    <button
      type="button"
      className="btn btn--style-primary btn--size-medium"
      disabled={loading}
      onClick={handleConfirm}
    >
      {loading ? 'Confirming...' : 'Confirm Crypto Order'}
    </button>
  )
}
