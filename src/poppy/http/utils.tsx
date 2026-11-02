import { getStreamAsBuffer, MaxBufferError } from 'get-stream'
import type { CompanyRequest, CompanyResponse } from '@datalayer/personal-agent-protocol/server'
import { getPayloadAuthInstance } from '@/app/(payload)/api/auth/auth-instance'
import { limitBackendRequest } from '@/security/utils'
import { createPoppyConfig } from '../config/utils'
import { getPoppyService } from '../runtime/utils'
import { POPPY_MAX_REQUEST_BYTES } from '../constants'
import { getPayload } from 'payload'
import config from '@payload-config'
import { findPoppyAccount } from '../accounts/utils'

const readBody = async (request: Request): Promise<string> =>
  request.body
    ? (await getStreamAsBuffer(request.body, { maxBuffer: POPPY_MAX_REQUEST_BYTES })).toString(
        'utf8',
      )
    : ''

export const isPoppyOAuthRequest = async (request: Request): Promise<boolean> => {
  const params =
    request.method === 'GET'
      ? new URL(request.url).searchParams
      : new URLSearchParams(await readBody(request.clone()))
  return (
    Boolean(params.get('client_assertion')) ||
    Boolean(params.get('client_id')?.startsWith('https://')) ||
    Boolean(params.get('request_id') && params.get('csrf') && params.get('decision'))
  )
}

export const toPoppyRequest = async (request: Request): Promise<CompanyRequest> => {
  const incoming = new URL(request.url)
  return {
    method: request.method,
    url: new URL(`${incoming.pathname}${incoming.search}`, createPoppyConfig().base).href,
    headers: Object.fromEntries(request.headers),
    body: await readBody(request),
  }
}

export const fromPoppyResponse = (response: CompanyResponse): Response => {
  const headers = new Headers(response.headers)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Cache-Control', 'no-store')
  if (response.stream) {
    // Streaming is not needed by the scoped MCP/account integration.
    return Response.json({ error: 'streaming_not_supported' }, { status: 406, headers })
  }
  if (response.body === undefined) {
    return new Response(null, { status: response.status, headers })
  }
  if (headers.get('Content-Type')?.startsWith('text/html') && typeof response.body === 'string') {
    headers.set(
      'Content-Security-Policy',
      "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    )
    return new Response(response.body, { status: response.status, headers })
  }
  return Response.json(response.body, { status: response.status, headers })
}

export const handlePoppyRequest = async (request: Request): Promise<Response> => {
  const limited = await limitBackendRequest(request)
  if (limited) {
    return limited
  }
  try {
    const service = await getPoppyService()
    const protocolRequest = await toPoppyRequest(request)
    return fromPoppyResponse(await service.handle(protocolRequest))
  } catch (error) {
    if (error instanceof MaxBufferError) {
      return Response.json({ error: 'request_too_large' }, { status: 413 })
    }
    console.error('Poppy request failed', error)
    return Response.json(
      { error: 'temporarily_unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export const handlePoppyOAuth = async (request: Request): Promise<Response> => {
  try {
    const action = new URL(request.url).pathname.split('/').at(-1)
    if (!['authorize', 'token', 'revoke'].includes(action || '')) {
      return Response.json({ error: 'not_found' }, { status: 404 })
    }
    if (request.method !== 'GET' && request.method !== 'POST') {
      return Response.json({ error: 'method_not_allowed' }, { status: 405 })
    }
    const payloadAuth = await getPayloadAuthInstance()
    // Old opaque-ID clients keep the same Better Auth engine and account records.
    if (action !== 'revoke' && !(await isPoppyOAuthRequest(request))) {
      const legacyUrl = new URL(`/api/auth/oauth2/${action}`, request.url)
      legacyUrl.search = new URL(request.url).search
      return payloadAuth.betterAuth.handler(new Request(legacyUrl, request))
    }
    const limited = await limitBackendRequest(request)
    if (limited) {
      return limited
    }
    const service = await getPoppyService()
    const protocol = await toPoppyRequest(request)
    const incoming = new URL(protocol.url)
    incoming.pathname = `/oauth/${action}`
    const canonicalRequest = { ...protocol, url: incoming.href }
    if (action !== 'authorize') {
      return fromPoppyResponse(await service.handle(canonicalRequest))
    }
    const session = await payloadAuth.betterAuth.api.getSession({ headers: request.headers })
    if (!session?.user) {
      if (request.method === 'POST') {
        return Response.json({ error: 'login_required' }, { status: 401 })
      }
      const login = new URL('/login', request.url)
      login.search = incoming.search
      return Response.redirect(login, 303)
    }
    if (!(await findPoppyAccount(await getPayload({ config }), session.user.id))) {
      return Response.json({ error: 'access_denied' }, { status: 403 })
    }
    if (request.method === 'GET') {
      return fromPoppyResponse(await service.handle(canonicalRequest))
    }
    const decision = await service.consentDecision(canonicalRequest)
    const redirect = decision.allow
      ? await service.approveAuthorization(decision.requestId, { accountId: session.user.id })
      : await service.denyAuthorization(decision.requestId)
    return new Response(null, {
      status: 303,
      headers: { Location: redirect, 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    if (error instanceof MaxBufferError) {
      return Response.json({ error: 'request_too_large' }, { status: 413 })
    }
    console.error('Poppy authorization failed', error)
    return Response.json(
      { error: 'invalid_request' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export const maybeHandlePoppyOAuth = async (request: Request): Promise<Response | null> => {
  try {
    return (await isPoppyOAuthRequest(request)) ? handlePoppyOAuth(request) : null
  } catch (error) {
    if (error instanceof MaxBufferError) {
      return Response.json({ error: 'request_too_large' }, { status: 413 })
    }
    throw error
  }
}

export const getPoppyDiscovery = async (request: Request): Promise<Response> => {
  const service = await getPoppyService()
  const domain = new URL(request.url).searchParams.get('domain') || service.config.domain
  try {
    return Response.json(service.discoveryDocument(domain), {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    })
  } catch (error) {
    console.error('Unrecognized Poppy domain', error)
    return Response.json({ error: 'unknown_company_domain' }, { status: 400 })
  }
}
