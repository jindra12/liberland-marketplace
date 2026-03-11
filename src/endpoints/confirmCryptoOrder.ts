import type { Endpoint } from 'payload'
import { cryptoAdapter } from '@/payments/cryptoAdapter'

export const confirmCryptoOrderEndpoint: Endpoint = {
  path: '/orders/:id/confirm-crypto',
  method: 'post',
  handler: async (req) => {
    if (!req.user?.role?.includes('admin')) {
      return Response.json({ error: 'Admin access required' }, { status: 403 })
    }

    const orderID = req.routeParams?.id
    if (!orderID) {
      return Response.json({ error: 'Order ID is required' }, { status: 400 })
    }

    try {
      const result = await cryptoAdapter().confirmOrder({
        data: { orderID },
        ordersSlug: 'orders',
        req,
        transactionsSlug: 'transactions',
      })

      return Response.json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to confirm order.'
      return Response.json({ error: message }, { status: 400 })
    }
  },
}
