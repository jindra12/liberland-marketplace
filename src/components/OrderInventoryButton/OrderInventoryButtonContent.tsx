'use client'

import { useState } from 'react'
import { toast, useDocumentInfo } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'

const toDocID = (value: unknown): string | null => {
  if (typeof value === 'string' || typeof value === 'number') {
    const id = String(value)
    return id.length > 0 ? id : null
  }

  return null
}

const OrderInventoryButtonContent = () => {
  const router = useRouter()
  const { id } = useDocumentInfo()
  const [loading, setLoading] = useState(false)

  const orderID = toDocID(id)

  const handleUpdateInventory = async () => {
    if (!orderID || loading) {
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`/api/orders/${orderID}/update-inventory`, {
        method: 'POST',
        credentials: 'include',
      })

      const body = (await response.json().catch(() => null)) as { error?: string } | null

      if (!response.ok) {
        throw new Error(body?.error || 'Failed to update order inventory.')
      }

      toast.success('Order inventory updated successfully.')

      try {
        router.refresh()
      } catch {
        window.location.reload()
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update order inventory.')
    } finally {
      setLoading(false)
    }
  }

  if (!orderID) {
    return null
  }

  return (
    <button
      type="button"
      className="btn btn--style-primary btn--size-medium"
      disabled={loading}
      onClick={handleUpdateInventory}
    >
      {loading ? 'Updating...' : 'Update Inventory'}
    </button>
  )
}

export default OrderInventoryButtonContent
