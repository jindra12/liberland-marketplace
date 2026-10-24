import { createHash } from 'node:crypto'
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible'

import {
  CLIENT_RAG_SEARCHES_PER_HOUR,
  CLIENT_REQUESTS_PER_MINUTE,
  GLOBAL_RAG_SEARCHES_PER_HOUR,
  GLOBAL_REQUESTS_PER_MINUTE,
} from './constants'

const requests = new RateLimiterMemory({ points: CLIENT_REQUESTS_PER_MINUTE, duration: 60 })
const globalRequests = new RateLimiterMemory({ points: GLOBAL_REQUESTS_PER_MINUTE, duration: 60 })
const searches = new RateLimiterMemory({ points: CLIENT_RAG_SEARCHES_PER_HOUR, duration: 3600 })
const globalSearches = new RateLimiterMemory({ points: GLOBAL_RAG_SEARCHES_PER_HOUR, duration: 3600 })

const getClientKey = (headers: Headers): string => {
  // nginx overwrites X-Real-IP; the Node server must remain behind trusted ingress.
  const header = process.env.VERCEL === '1' ? 'x-vercel-forwarded-for' : 'x-real-ip'
  return createHash('sha256').update(headers.get(header) || 'unidentified-client').digest('hex')
}

export const rateLimitResponse = (limit: RateLimiterRes): Response => {
  const retryAfter = Math.max(1, Math.ceil(limit.msBeforeNext / 1000))
  return Response.json(
    { error: 'Backend request or AI search quota reached. Please retry later.', retryAfter },
    { status: 429, headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' } },
  )
}

export const limitBackendRequest = async (request: Request): Promise<Response | null> => {
  try {
    await globalRequests.consume('backend')
    await requests.consume(getClientKey(request.headers))
    return null
  } catch (error) {
    if (error instanceof RateLimiterRes) {
      return rateLimitResponse(error)
    }
    throw error
  }
}

export const consumeRagQuota = async (headers: Headers, authenticatedUser?: string): Promise<void> => {
  const key = authenticatedUser ? `user:${authenticatedUser}` : `client:${getClientKey(headers)}`
  await searches.consume(key)
  await globalSearches.consume('backend')
}
