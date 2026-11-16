import { createHmac, timingSafeEqual } from 'node:crypto'
import { APIError } from 'payload'
import { z } from 'zod'
import { PAYMENT_SIGNATURE_TOLERANCE_SECONDS } from './constants'

export const checkoutReturnUrlSchema = z
  .url({ protocol: /^https?$/ })
  .max(2048)
  .refine((value) => {
    const url = new URL(value)
    return (
      !url.username &&
      !url.password &&
      (url.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    )
  }, 'Return URLs must use HTTPS, or localhost for development, without credentials.')

export const createCheckoutSchema = z
  .object({
    companyId: z.string().min(1).max(100),
    productId: z.string().min(1).max(100).optional(),
    quantity: z.number().int().min(1).max(100).default(1),
    amountUsdCents: z.number().int().min(100).max(100_000_000).optional(),
    externalReference: z.string().min(1).max(100).optional(),
    returnUrl: checkoutReturnUrlSchema.optional(),
  })
  .strict()

export const paymentWebhookUrlSchema = z
  .url({ protocol: /^https$/ })
  .max(100)
  .refine((value) => {
    const url = new URL(value)
    return !url.username && !url.password && !url.hash
  }, 'Use an HTTPS endpoint without credentials or a fragment.')

export const signPaymentBody = (secret: string, timestamp: string, rawBody: string): string =>
  createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')

export const verifyPaymentRequest = (secret: string, headers: Headers, rawBody: string) => {
  const timestamp = headers.get('x-nswap-timestamp') || ''
  const signature = headers.get('x-nswap-signature') || ''
  if (!/^\d+$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature)) {
    throw new APIError(
      'A signed merchant request is required for external references or return URLs.',
      401,
    )
  }
  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  const expected = signPaymentBody(secret, timestamp, rawBody)
  if (
    age > PAYMENT_SIGNATURE_TOLERANCE_SECONDS ||
    !timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))
  ) {
    throw new APIError('Invalid or expired merchant signature.', 401)
  }
}
