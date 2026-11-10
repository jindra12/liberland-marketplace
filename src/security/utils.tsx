import { createHash } from 'node:crypto'
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible'
import { guardedFetch } from 'guarded-fetch'
import { getStreamAsArrayBuffer } from 'get-stream'
import { getServerSideURL, getFrontendURL } from '@/utilities/getURL'
import type { AuthStrategy } from 'payload'
import ipaddr from 'ipaddr.js'

import {
  CLIENT_RAG_SEARCHES_PER_HOUR,
  CLIENT_REQUESTS_PER_MINUTE,
  GLOBAL_RAG_SEARCHES_PER_HOUR,
  GLOBAL_REQUESTS_PER_MINUTE,
  PUBLIC_FETCH_TIMEOUT_MS,
  PUBLIC_FETCH_MAX_BYTES,
} from './constants'

export const getTrustedBrowserOrigins = (): string[] => [
  ...new Set(
    [
      getServerSideURL(),
      getFrontendURL(),
      ...(process.env.OIDC_REDIRECT_URLS || '').split(',').filter(Boolean),
    ].map((url) => new URL(url).origin),
  ),
]

/** Better Auth's custom Payload strategy does not run Payload's JWT cookie CSRF check. */
export const guardCookieAuthStrategy = (strategy: AuthStrategy): AuthStrategy => ({
  ...strategy,
  authenticate: async (args) => {
    if (args.headers.has('cookie')) {
      const origin = args.headers.get('origin')
      const trusted = origin
        ? getTrustedBrowserOrigins().includes(origin)
        : ['same-origin', 'same-site', 'none'].includes(args.headers.get('sec-fetch-site') || '')
      if (!trusted) {
        return { user: null }
      }
    }
    return strategy.authenticate(args)
  },
})

/** Pin DNS at connect time and keep one abort deadline through the complete bounded body read. */
export const fetchPublicResource = async (
  url: string | URL,
  maximumBytes = PUBLIC_FETCH_MAX_BYTES,
) => {
  const signal = AbortSignal.timeout(PUBLIC_FETCH_TIMEOUT_MS)
  const response = await guardedFetch(url, {
    timeoutMs: PUBLIC_FETCH_TIMEOUT_MS,
    signal,
    opaqueErrors: true,
    fetch,
  })
  const bytes = response.body
    ? await getStreamAsArrayBuffer(
        response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>(), { signal }),
        { maxBuffer: maximumBytes },
      )
    : new ArrayBuffer(0)
  return { response, bytes }
}

const requests = new RateLimiterMemory({ points: CLIENT_REQUESTS_PER_MINUTE, duration: 60 })
const globalRequests = new RateLimiterMemory({ points: GLOBAL_REQUESTS_PER_MINUTE, duration: 60 })
const searches = new RateLimiterMemory({ points: CLIENT_RAG_SEARCHES_PER_HOUR, duration: 3600 })
const globalSearches = new RateLimiterMemory({
  points: GLOBAL_RAG_SEARCHES_PER_HOUR,
  duration: 3600,
})

const getClientKey = (headers: Headers): string => {
  // nginx overwrites X-Real-IP; the Node server must remain behind trusted ingress.
  const header = process.env.VERCEL === '1' ? 'x-vercel-forwarded-for' : 'x-real-ip'
  const address = headers.get(header) || ''
  if (!ipaddr.isValid(address)) {
    return 'unidentified-client'
  }
  const parsed = ipaddr.process(address)
  const key =
    parsed.kind() === 'ipv6' ? parsed.toByteArray().slice(0, 8).join('.') : parsed.toString()
  return createHash('sha256').update(key).digest('hex')
}

export const rateLimitResponse = (limit: RateLimiterRes): Response => {
  const retryAfter = Math.max(1, Math.ceil(limit.msBeforeNext / 1000))
  return Response.json(
    { error: 'Backend request or AI search quota reached. Please retry later.', retryAfter },
    { status: 429, headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' } },
  )
}

export const limitBackendRequest = async (
  request: Pick<Request, 'headers'>,
): Promise<Response | null> => {
  try {
    await requests.consume(getClientKey(request.headers))
    await globalRequests.consume('backend')
    return null
  } catch (error) {
    if (error instanceof RateLimiterRes) {
      return rateLimitResponse(error)
    }
    throw error
  }
}

export const consumeRagQuota = async (
  headers: Headers,
  authenticatedUser?: string,
): Promise<void> => {
  const key = authenticatedUser ? `user:${authenticatedUser}` : `client:${getClientKey(headers)}`
  await searches.consume(key)
  await globalSearches.consume('backend')
}
