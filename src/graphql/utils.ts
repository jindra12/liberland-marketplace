import { APIError, type PayloadRequest } from 'payload'
import { limitBackendRequest } from '@/security/utils'

/** Keep the same request budget and cache policy as the public HTTP handlers. */
export const protectGraphQLRequest = async (req: PayloadRequest) => {
  req.responseHeaders ||= new Headers()
  req.responseHeaders.set('Cache-Control', 'no-store')
  const limited = await limitBackendRequest(req)
  if (limited) {
    limited.headers.forEach((value, name) => req.responseHeaders!.set(name, value))
    throw new APIError('Backend request limit reached. Please retry later.', limited.status)
  }
}
