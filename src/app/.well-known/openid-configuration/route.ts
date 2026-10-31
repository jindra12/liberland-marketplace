import { getPayloadAuthInstance } from '@/app/(payload)/api/auth/auth-instance'

export const dynamic = 'force-dynamic'
export const GET = async (request: Request) => {
  const auth = await getPayloadAuthInstance()
  return auth.betterAuth.handler(new Request(new URL('/api/auth/.well-known/openid-configuration', request.url), { method: 'GET', headers: request.headers }))
}
