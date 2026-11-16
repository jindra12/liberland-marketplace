import { APIError } from 'payload'
import type { Webhook } from 'thirdweb/bridge'

/** Keep SDK signature/schema failures separate from retryable storage or queue failures. */
export const parseThirdwebPayment = async (...args: Parameters<typeof Webhook.parse>) => {
  const { Webhook } = await import('thirdweb/bridge')
  try {
    return await Webhook.parse(...args)
  } catch (error) {
    throw new APIError(error instanceof Error ? error.message : 'Invalid Thirdweb webhook.', 400)
  }
}
