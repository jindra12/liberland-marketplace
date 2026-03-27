import type { Endpoint } from 'payload'
import { z } from 'zod'
import { trackAnalyticsEvent } from '@/utilities/analytics/locallytics'
import { getAnalyticsRequestMetadata } from '@/utilities/analytics/shared'
import { analyticsTemporaryFailureResponse, jsonBodyRequiredResponse } from './shared'

const stringIdSchema = z.union([z.number(), z.string()]).transform(String).pipe(z.string().min(1))

const analyticsTrackSchema = z.object({
  distinctId: stringIdSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  route: z.string().trim().min(1).optional(),
  sessionId: stringIdSchema.optional(),
  type: z.string().trim().min(1),
})

const createGeneratedId = (prefix: 'anon' | 'sess') => `${prefix}_${crypto.randomUUID()}`

export const analyticsTrackEndpoint: Endpoint = {
  path: '/analytics/track',
  method: 'post',
  handler: async (req) => {
    if (typeof req.json !== 'function') {
      return jsonBodyRequiredResponse()
    }

    const body = await req.json().catch(() => null)
    const parsed = analyticsTrackSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        {
          error: 'Invalid analytics payload.',
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      )
    }

    const { ip, origin, referer, userAgent } = getAnalyticsRequestMetadata(req)
    const distinctId =
      parsed.data.distinctId ??
      (typeof req.user === 'object' && req.user?.id ? String(req.user.id) : createGeneratedId('anon'))
    const sessionId = parsed.data.sessionId ?? createGeneratedId('sess')
    const metadata = {
      ...parsed.data.metadata,
      ...(parsed.data.route ? { route: parsed.data.route } : {}),
      requestIp: ip ?? undefined,
      requestOrigin: origin ?? undefined,
      requestReferer: referer ?? undefined,
      requestUserAgent: userAgent ?? undefined,
      sessionId,
    }

    try {
      const event = await trackAnalyticsEvent({
        authenticatedUserId:
          typeof req.user === 'object' && req.user?.id ? String(req.user.id) : undefined,
        distinctId,
        metadata,
        requestIp: ip,
        sessionId,
        type: parsed.data.type,
      })

      return Response.json({
        analytics: {
          distinctId,
          eventId: event.id ?? null,
          sessionId,
        },
        success: true,
      })
    } catch {
      return analyticsTemporaryFailureResponse()
    }
  },
}
