import type { TaskConfig } from 'payload'
import { recordOrderCheckoutPayment } from './service'

/** Confirmation retries survive browser closure and backend restarts. */
export const confirmThirdwebOrderTask: TaskConfig<'confirmThirdwebOrder'> = {
  slug: 'confirmThirdwebOrder',
  concurrency: {
    key: ({ input }) => `thirdweb-order:${input.sessionId}`,
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
    await recordOrderCheckoutPayment(req, session)
    return { output: {} }
  },
}
