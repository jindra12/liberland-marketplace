import type { TaskConfig } from 'payload'
import { guardedFetch } from 'guarded-fetch'
import { signPaymentBody, paymentWebhookUrlSchema } from './utils'
import { getPaymentWebhookSecret } from './integration'
import { toStringID } from '@/utilities/toStringID'

export const deliverPaymentWebhookTask: TaskConfig<'deliverPaymentWebhook'> = {
  slug: 'deliverPaymentWebhook',
  concurrency: {
    key: ({ input }) => `payment:${input.sessionId}`,
    exclusive: true,
    supersedes: true,
  },
  inputSchema: [{ name: 'sessionId', type: 'text', required: true }],
  retries: { attempts: 10, backoff: { type: 'exponential', delay: 60_000 } },
  handler: async ({ input, req }) => {
    const session = await req.payload.findByID({
      collection: 'checkout-sessions',
      id: input.sessionId,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (session.deliveredAt) {
      return { output: {} }
    }
    if (session.status !== 'paid' || !session.notification) {
      throw new Error('A verified payment notification is required before delivery.')
    }
    const url = paymentWebhookUrlSchema.parse(session.webhookUrl)
    const body = JSON.stringify(session.notification)
    const timestamp = String(Math.floor(Date.now() / 1000))
    const secret = await getPaymentWebhookSecret(req, toStringID(session.company)!)
    if (!secret) {
      throw new Error('The company must generate a payment signing secret before delivery.')
    }
    const response = await guardedFetch(url, {
      method: 'POST',
      body,
      httpsOnly: true,
      maxRedirects: 0,
      timeoutMs: 10_000,
      signal: AbortSignal.timeout(10_000),
      headers: {
        'Content-Type': 'application/json',
        'X-Nswap-Event-Id': session.publicId,
        'X-Nswap-Timestamp': timestamp,
        'X-Nswap-Signature': signPaymentBody(secret, timestamp, body),
      },
    })
    await response.body?.cancel()
    if (!response.ok) {
      throw new Error(`Merchant webhook returned HTTP ${response.status}.`)
    }
    await req.payload.update({
      collection: 'checkout-sessions',
      id: session.id,
      overrideAccess: true,
      req,
      data: { deliveredAt: new Date().toISOString() },
    })
    return { output: {} }
  },
}
