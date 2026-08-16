import { getPayloadAuthInstance } from '../auth-instance'

export const dynamic = 'force-dynamic'

const ALLOWED_ORIGINS = (process.env.OIDC_REDIRECT_URLS || '')
  .split(',')
  .filter(Boolean)
  .map((url) => new URL(url).origin)

const corsHeaders = (origin: string): HeadersInit => {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  }
}

const isAllowedOrigin = (req: Request): string | null => {
  const origin = req.headers.get('origin')
  return origin && ALLOWED_ORIGINS.includes(origin) ? origin : null
}

const getSignOutRedirect = (req: Request): string => {
  const fallback = ALLOWED_ORIGINS[0] ?? new URL(req.url).origin
  const callbackURL = new URL(req.url).searchParams.get('callbackURL')

  if (!callbackURL) {
    return fallback
  }

  try {
    const callback = new URL(callbackURL)
    return ALLOWED_ORIGINS.includes(callback.origin) ? callback.toString() : fallback
  } catch {
    return fallback
  }
}

const handleSignOutRedirect = async (req: Request, payloadAuth: Awaited<ReturnType<typeof getPayloadAuthInstance>>) => {
  const signOutRequest = new Request(req, { method: 'POST' })
  const signOutResponse = await payloadAuth.betterAuth.handler(signOutRequest)
  const redirectResponse = Response.redirect(getSignOutRedirect(req), 303)

  signOutResponse.headers.getSetCookie().forEach((cookie) => {
    redirectResponse.headers.append('Set-Cookie', cookie)
  })

  return redirectResponse
}

const handler = async (req: Request) => {
  const payloadAuth = await getPayloadAuthInstance()

  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/sign-out')) {
    return handleSignOutRedirect(req, payloadAuth)
  }

  const origin = isAllowedOrigin(req)

  if (req.method === 'OPTIONS' && origin) {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  const response = await payloadAuth.betterAuth.handler(req)

  if (origin) {
    const headers = new Headers(response.headers)
    for (const [key, value] of Object.entries(corsHeaders(origin))) {
      headers.set(key, value)
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }

  return response
}

export const GET = handler
export const POST = handler
export const OPTIONS = handler
