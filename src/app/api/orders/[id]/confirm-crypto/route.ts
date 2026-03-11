import { createLocalReq, getPayload } from 'payload'
import config from '@payload-config'
import { headers } from 'next/headers'
import { cryptoAdapter } from '@/payments/cryptoAdapter'

const extractOrderID = (request: Request): string | null => {
  const pathname = new URL(request.url).pathname
  const match = pathname.match(/\/api\/orders\/([^/]+)\/confirm-crypto\/?$/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

export async function POST(request: Request): Promise<Response> {
  const orderID = extractOrderID(request)
  if (!orderID) {
    return Response.json({ error: 'Order ID is required' }, { status: 400 })
  }

  const payload = await getPayload({ config })
  const requestHeaders = await headers()
  const { user } = await payload.auth({ headers: requestHeaders })

  if (!user?.role?.includes('admin')) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const payloadReq = await createLocalReq({ user }, payload)

    const result = await cryptoAdapter().confirmOrder({
      cartsSlug: 'carts',
      data: { orderID },
      ordersSlug: 'orders',
      req: payloadReq,
      transactionsSlug: 'transactions',
    })

    return Response.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to confirm order.'
    return Response.json({ error: message }, { status: 400 })
  }
}
