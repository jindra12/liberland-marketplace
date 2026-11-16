import { APIError, type Endpoint } from 'payload'
import { getStreamAsBuffer } from 'get-stream'
import { ZodError } from 'zod'
import { limitBackendRequest } from '@/security/utils'
import {
  acceptThirdwebPayment,
  createCheckoutSession,
  findCheckoutSession,
  publicCheckoutSession,
} from './service'

const handleCheckout: (action: 'create' | 'read' | 'thirdweb') => Endpoint['handler'] =
  (action) => async (req) => {
    const limited = await limitBackendRequest(req)
    if (limited) {
      return limited
    }
    try {
      if (action === 'read') {
        const session = await findCheckoutSession(req, String(req.routeParams?.id || ''))
        return Response.json(publicCheckoutSession(session), {
          headers: { 'Cache-Control': 'no-store' },
        })
      }
      const body = req.body
        ? await getStreamAsBuffer(req.body, { maxBuffer: 65_536 })
        : Buffer.alloc(0)
      const result =
        action === 'create'
          ? await createCheckoutSession(req, body.toString('utf8'))
          : await acceptThirdwebPayment(req, body.toString('utf8'))
      return Response.json(result, {
        status: action === 'create' ? 201 : 200,
        headers: { 'Cache-Control': 'no-store' },
      })
    } catch (error) {
      req.payload.logger.error({ err: error, msg: `Hosted checkout ${action} failed` })
      const status =
        error instanceof APIError
          ? error.status
          : error instanceof ZodError || error instanceof SyntaxError
            ? 400
            : 500
      return Response.json(
        {
          error:
            error instanceof Error && status < 500
              ? error.message
              : 'Checkout is temporarily unavailable.',
        },
        { status },
      )
    }
  }

export const checkoutEndpoints: Endpoint[] = [
  { path: '/checkout/sessions', method: 'post', handler: handleCheckout('create') },
  { path: '/checkout/sessions/:id', method: 'get', handler: handleCheckout('read') },
  { path: '/checkout/thirdweb', method: 'post', handler: handleCheckout('thirdweb') },
]
