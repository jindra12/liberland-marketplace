import { randomUUID, createHash } from 'node:crypto'
import { SignJWT, generateKeyPair, exportJWK, calculateJwkThumbprint } from 'jose'
import { load } from 'cheerio'
import { contribution, definePlugin } from '@datalayer/reactor'
import {
  buildCompany,
  CompanyConfig,
  CompanyAccounts,
  CompanyAgents,
  CompanyMcps,
  CompanyStores,
  SignInRefused,
  type CompanyStore,
  type CompanyRequest,
} from '@datalayer/personal-agent-protocol/server'
import { JWT_CLIENT_ASSERTION, parseTokenResponse } from '@datalayer/personal-agent-protocol'

export const TEST_ISSUER = 'https://backend.example'
export const TEST_AGENT = 'https://agent.example/agent.json'

export const createTestAgent = async () => {
  const root = await generateKeyPair('ES256', { extractable: true })
  const delegated = await generateKeyPair('ES256', { extractable: true })
  const rootJwk = { ...(await exportJWK(root.publicKey)), kid: 'root', alg: 'ES256' }
  const delegatedJwk = await exportJWK(delegated.publicKey)
  const thumbprint = await calculateJwkThumbprint(delegatedJwk)
  const now = Math.floor(Date.now() / 1000)
  const delegation = await new SignJWT({ iss: TEST_AGENT, cnf: { jwk: delegatedJwk } })
    .setProtectedHeader({ alg: 'ES256', typ: 'pap-delegation+jwt', kid: 'root' })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setJti(randomUUID())
    .sign(root.privateKey)
  const metadata = {
    client_id: TEST_AGENT,
    client_name: 'Test Personal Agent',
    jwks_uri: 'https://agent.example/jwks.json',
    redirect_uris: ['https://agent.example/callback'],
    token_endpoint_auth_method: 'private_key_jwt',
  }
  return {
    fetch: async (input: string | URL | Request) => {
      const url = new Request(input).url
      if (url === TEST_AGENT) {
        return Response.json(metadata)
      }
      if (url === metadata.jwks_uri) {
        return Response.json({ keys: [rootJwk] })
      }
      throw new Error(`Unexpected metadata request: ${url}`)
    },
    assertion: (audience = TEST_ISSUER) =>
      new SignJWT({ iss: TEST_AGENT, sub: TEST_AGENT, aud: audience })
        .setProtectedHeader({ alg: 'ES256', typ: 'JWT', kid: 'root' })
        .setIssuedAt()
        .setExpirationTime('1m')
        .setJti(randomUUID())
        .sign(root.privateKey),
    session: (
      path: string,
      options: {
        token?: string
        sid?: string
        sub?: string
        audience?: string
        method?: string
        issuedAt?: number
      } = {},
    ) => {
      const url = new URL(path, TEST_ISSUER)
      return new SignJWT({
        iss: TEST_AGENT,
        aud: options.audience || TEST_ISSUER,
        sid: options.sid || 'test-session-0123456789',
        sub: options.sub || 'pairwise-user',
        htm: options.method || 'POST',
        htu: `${url.origin}${url.pathname}`,
        ...(options.token
          ? { ath: createHash('sha256').update(options.token).digest('base64url') }
          : {}),
      })
        .setProtectedHeader({
          alg: 'ES256',
          typ: 'poppy-session+jwt',
          kid: thumbprint,
          pap_dlg: delegation,
        })
        .setIssuedAt(options.issuedAt ?? Math.floor(Date.now() / 1000))
        .setJti(randomUUID())
        .sign(delegated.privateKey)
    },
  }
}

export const createTestCompany = (
  store: CompanyStore,
  agent: Awaited<ReturnType<typeof createTestAgent>>,
) =>
  buildCompany(
    new CompanyConfig({
      name: 'Test marketplace',
      domain: 'backend.example',
      aliases: ['frontend.example'],
      scopes: ['account:read', 'account:write'],
      writeScopes: ['account:write'],
      scopeDescriptions: {
        'account:read': 'Read your account',
        'account:write': 'Change your account',
      },
      direct: true,
      device: false,
      operations: false,
      feedback: false,
    }),
    {
      fetch: agent.fetch,
      plugins: [
        definePlugin({
          name: 'test-marketplace',
          contributes: [
            contribution(CompanyStores, store),
            contribution(CompanyAccounts, {
              authenticate: async () => {
                throw new SignInRefused()
              },
              checkCode: async () => false,
            }),
            contribution(CompanyAgents, {
              respond: async (turn) => [
                { text: 'Marketplace', data: { accountId: turn.accountId || null } },
              ],
            }),
            contribution(CompanyMcps, {
              description: 'Test account tools',
              tools: () => [{ name: 'account', inputSchema: { type: 'object' } }],
              call: async (_, __, caller) => ({
                structured: { accountId: caller.accountId || null, scopes: caller.scopes },
              }),
            }),
          ],
        }),
      ],
    },
  )

export const protocolRequest = (
  path: string,
  headers: Record<string, string> = {},
  body = '',
): CompanyRequest => ({ method: 'POST', url: new URL(path, TEST_ISSUER).href, headers, body })

export const signInTestAgent = async (
  service: ReturnType<typeof createTestCompany>,
  agent: Awaited<ReturnType<typeof createTestAgent>>,
  accountId = 'account-alice',
) => {
  const verifier = randomUUID() + randomUUID()
  const query = new URLSearchParams({
    client_id: TEST_AGENT,
    redirect_uri: 'https://agent.example/callback',
    response_type: 'code',
    scope: 'account:read account:write',
    state: 'one-time-state',
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  })
  const page = await service.handle({
    method: 'GET',
    url: `${TEST_ISSUER}/oauth/authorize?${query}`,
    headers: {},
  })
  if (page.status !== 200 || typeof page.body !== 'string') {
    throw new Error('Authorization did not produce a consent page')
  }
  const html = load(page.body)
  const requestId = html('input[name=request_id]').attr('value')!
  const csrf = html('input[name=csrf]').attr('value')!
  const cookie = page.headers['Set-Cookie'].split(';')[0]
  const decision = await service.consentDecision(
    protocolRequest(
      '/oauth/authorize',
      { cookie, origin: TEST_ISSUER, 'sec-fetch-site': 'same-origin' },
      new URLSearchParams({ request_id: requestId, csrf, decision: 'allow' }).toString(),
    ),
  )
  const redirect = new URL(await service.approveAuthorization(decision.requestId, { accountId }))
  if (
    redirect.searchParams.get('state') !== 'one-time-state' ||
    redirect.searchParams.get('iss') !== TEST_ISSUER
  ) {
    throw new Error('The authorization redirect lost state or issuer binding')
  }
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: TEST_AGENT,
    code: redirect.searchParams.get('code')!,
    redirect_uri: 'https://agent.example/callback',
    code_verifier: verifier,
    client_assertion_type: JWT_CLIENT_ASSERTION,
    client_assertion: await agent.assertion(),
  })
  const response = await service.handle(protocolRequest('/oauth/token', {}, form.toString()))
  if (response.status !== 200) {
    throw new Error(`Code exchange failed: ${JSON.stringify(response.body)}`)
  }
  return { tokens: parseTokenResponse(response.body), codeForm: form, requestId, csrf, cookie }
}

export const refreshTestAgent = async (
  service: ReturnType<typeof createTestCompany>,
  agent: Awaited<ReturnType<typeof createTestAgent>>,
  refreshToken: string,
  extra: Record<string, string> = {},
) => {
  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: TEST_AGENT,
    refresh_token: refreshToken,
    client_assertion_type: JWT_CLIENT_ASSERTION,
    client_assertion: await agent.assertion(),
    ...extra,
  })
  return service.handle(protocolRequest('/oauth/token', {}, form.toString()))
}
