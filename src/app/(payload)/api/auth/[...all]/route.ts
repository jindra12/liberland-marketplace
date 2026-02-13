import config from '@payload-config'
import { getPayloadAuth } from 'payload-auth/better-auth'

const payloadAuth = await getPayloadAuth(config)

const ALLOWED_ORIGINS = (process.env.OIDC_REDIRECT_URLS || '')
  .split(',')
  .filter(Boolean)
  .map((url) => new URL(url).origin)

function corsHeaders(origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  }
}

function isAllowedOrigin(req: Request): string | null {
  const origin = req.headers.get('origin')
  return origin && ALLOWED_ORIGINS.includes(origin) ? origin : null
}

async function handler(req: Request) {
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
