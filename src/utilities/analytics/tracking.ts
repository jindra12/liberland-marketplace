import type { PayloadRequest } from 'payload'
import { z } from 'zod'
import { trackAnalyticsEvent } from './locallytics'
import { getAnalyticsRequestMetadata } from './shared'

const stringIdSchema = z.union([z.number(), z.string()]).transform(String).pipe(z.string().min(1))

export const analyticsTrackInputSchema = z.object({
  distinctId: stringIdSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  route: z.string().trim().min(1).optional(),
  sessionId: stringIdSchema.optional(),
  type: z.string().trim().min(1),
})

export type AnalyticsTrackInput = z.output<typeof analyticsTrackInputSchema>

export type AnalyticsTrackResult = {
  analytics: {
    distinctId: string
    eventId: null | string
    sessionId: string
  }
  success: true
}

const createGeneratedId = (prefix: 'anon' | 'sess') => `${prefix}_${crypto.randomUUID()}`

export const trackAnalyticsRequest = async ({
  input,
  req,
}: {
  input: AnalyticsTrackInput
  req: PayloadRequest
}): Promise<AnalyticsTrackResult> => {
  const { ip, origin, referer, userAgent } = getAnalyticsRequestMetadata(req)
  const authenticatedUserId =
    typeof req.user === 'object' && req.user?.id ? String(req.user.id) : undefined
  const distinctId = input.distinctId ?? authenticatedUserId ?? createGeneratedId('anon')
  const sessionId = input.sessionId ?? createGeneratedId('sess')
  const metadata = {
    ...input.metadata,
    ...(input.route ? { route: input.route } : {}),
    requestIp: ip,
    requestOrigin: origin ?? undefined,
    requestReferer: referer ?? undefined,
    requestUserAgent: userAgent ?? undefined,
    sessionId,
  }

  const event = await trackAnalyticsEvent({
    authenticatedUserId,
    distinctId,
    metadata,
    requestIp: ip,
    sessionId,
    type: input.type,
  })

  return {
    analytics: {
      distinctId,
      eventId: event.id == null ? null : String(event.id),
      sessionId,
    },
    success: true,
  }
}
