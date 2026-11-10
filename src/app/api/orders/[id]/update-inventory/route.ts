import { APIError, createLocalReq, getPayload } from 'payload'
import config from '@payload-config'
import { headers } from 'next/headers'
import { applyOrderInventory } from '@/commerce/inventory/utils'

export const POST = async (request: Request): Promise<Response> => {
  const match = new URL(request.url).pathname.match(/\/api\/orders\/([^/]+)\/update-inventory\/?$/)
  const orderID = match?.[1] ? decodeURIComponent(match[1]) : null
  if (!orderID) {
    return Response.json({ error: 'Order ID is required.' }, { status: 400 })
  }
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user?.role?.includes('admin')) {
    return Response.json({ error: 'Admin access required.' }, { status: 403 })
  }
  try {
    const req = await createLocalReq({ user }, payload)
    return Response.json({ orderID, updated: await applyOrderInventory(orderID, req) })
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to update order inventory.',
      },
      { status: error instanceof APIError ? error.status : 500 },
    )
  }
}
