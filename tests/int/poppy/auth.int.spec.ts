// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'
import {
  JWT_CLIENT_ASSERTION,
  parseTokenResponse,
  parseDiscoveryDocument,
  parseOAuthServerMetadata,
  listsResource,
} from '@datalayer/personal-agent-protocol'
import { createPayloadPoppyStore } from '@/poppy/store/utils'
import { createPoppyTestPayload, destroyPoppyTestPayload } from '../../poppy/payload/utils'
import {
  createTestAgent,
  createTestCompany,
  protocolRequest,
  refreshTestAgent,
  signInTestAgent,
  TEST_AGENT,
  TEST_ISSUER,
} from '../../poppy/utils'

const holder: { payload?: Payload } = {}
const createFixture = async () => {
  const agent = await createTestAgent()
  const store = createPayloadPoppyStore(
    holder.payload!,
    `${TEST_ISSUER}/${randomUUID()}`,
    'test-only-poppy-secret',
  )
  return { agent, store, service: createTestCompany(store, agent) }
}

describe('Poppy cryptographic sign-in, sessions and refresh', () => {
  beforeAll(async () => {
    holder.payload = await createPoppyTestPayload('auth')
  })
  afterAll(async () => {
    if (holder.payload) {
      await destroyPoppyTestPayload(holder.payload)
    }
  })

  it('publishes a verifiable alias/issuer relationship and keeps scoped account access after service recreation', async () => {
    const { agent, store, service } = await createFixture()
    const document = parseDiscoveryDocument(service.discoveryDocument('frontend.example'))
    const metadata = parseOAuthServerMetadata(service.oauthMetadata())
    expect(document.auth?.issuer).toBe(TEST_ISSUER)
    expect(listsResource(metadata, 'frontend.example')).toBe(true)
    expect(() => service.discoveryDocument('attacker.example')).toThrow()
    const signedIn = await signInTestAgent(service, agent)
    const restored = createTestCompany(store, agent)
    const refreshed = await refreshTestAgent(
      restored,
      agent,
      signedIn.tokens.refreshToken!.reveal(),
      { resource: `${TEST_ISSUER}/mcp`, scope: 'account:read' },
    )
    expect(refreshed.status).toBe(200)
    const token = parseTokenResponse(refreshed.body).accessToken.reveal()
    const header = await agent.session('/mcp', { token })
    const response = await restored.handle(
      protocolRequest(
        '/mcp',
        { authorization: `Bearer ${token}`, 'poppy-session': header },
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'account', arguments: {} },
        }),
      ),
    )
    expect(response.status, JSON.stringify(response.body)).toBe(200)
    expect(JSON.stringify(response.body)).toContain('account-alice')
    expect(JSON.stringify(response.body)).not.toContain('account:write')
    const replay = await restored.handle(
      protocolRequest('/mcp', { authorization: `Bearer ${token}`, 'poppy-session': header }, '{}'),
    )
    expect(replay.status).toBe(400)
  })

  it('rejects stolen/default tokens, wrong request binding, stale sessions and changed pairwise identities', async () => {
    const { agent, service } = await createFixture()
    const signedIn = await signInTestAgent(service, agent)
    const original = signedIn.tokens.accessToken.reveal()
    expect(
      (await service.handle(protocolRequest('/mcp', { authorization: `Bearer ${original}` }, '{}')))
        .status,
    ).not.toBe(200)
    const refreshed = await refreshTestAgent(
      service,
      agent,
      signedIn.tokens.refreshToken!.reveal(),
      { resource: `${TEST_ISSUER}/mcp` },
    )
    const token = parseTokenResponse(refreshed.body).accessToken.reveal()
    const headers = async (path: string, options: Parameters<typeof agent.session>[1] = {}) => ({
      authorization: `Bearer ${token}`,
      'poppy-session': await agent.session(path, { token, ...options }),
    })
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })
    expect(
      (await service.handle(protocolRequest('/mcp', await headers('/other'), body))).status,
    ).toBe(400)
    expect(
      (
        await service.handle(
          protocolRequest(
            '/mcp',
            await headers('/mcp', { audience: 'https://attacker.example' }),
            body,
          ),
        )
      ).status,
    ).toBe(400)
    expect(
      (
        await service.handle(
          protocolRequest(
            '/mcp',
            await headers('/mcp', { issuedAt: Math.floor(Date.now() / 1000) - 3600 }),
            body,
          ),
        )
      ).status,
    ).toBe(400)
    expect(
      (await service.handle(protocolRequest('/mcp', await headers('/mcp'), body))).status,
    ).toBe(200)
    expect(
      (
        await service.handle(
          protocolRequest('/mcp', await headers('/mcp', { sub: 'different-user' }), body),
        )
      ).status,
    ).toBe(400)
  })

  it('rejects assertion replay, endpoint audiences, code replay and cross-origin consent', async () => {
    const { agent, service } = await createFixture()
    const signedIn = await signInTestAgent(service, agent)
    const wrong = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: signedIn.tokens.refreshToken!.reveal(),
      client_id: TEST_AGENT,
      client_assertion_type: JWT_CLIENT_ASSERTION,
      client_assertion: await agent.assertion(`${TEST_ISSUER}/oauth/token`),
    })
    expect(
      (await service.handle(protocolRequest('/oauth/token', {}, wrong.toString()))).status,
    ).toBe(401)
    const reused = new URLSearchParams(signedIn.codeForm)
    reused.set('client_assertion', await agent.assertion())
    expect(
      (await service.handle(protocolRequest('/oauth/token', {}, reused.toString()))).status,
    ).toBe(400)
    const replayed = await agent.assertion()
    const form = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: signedIn.tokens.refreshToken!.reveal(),
      client_id: TEST_AGENT,
      client_assertion_type: JWT_CLIENT_ASSERTION,
      client_assertion: replayed,
    })
    expect(
      (await service.handle(protocolRequest('/oauth/token', {}, form.toString()))).status,
    ).toBe(200)
    expect(
      (await service.handle(protocolRequest('/oauth/token', {}, form.toString()))).status,
    ).toBe(401)
    await expect(
      service.consentDecision(
        protocolRequest(
          '/oauth/authorize',
          {
            cookie: signedIn.cookie,
            origin: 'https://attacker.example',
            'sec-fetch-site': 'cross-site',
          },
          new URLSearchParams({
            request_id: signedIn.requestId,
            csrf: signedIn.csrf,
            decision: 'allow',
          }).toString(),
        ),
      ),
    ).rejects.toThrow()
  })

  it('does not widen scopes, rotates refresh tokens atomically and revokes their family', async () => {
    const { agent, service } = await createFixture()
    const signedIn = await signInTestAgent(service, agent)
    const refresh = signedIn.tokens.refreshToken!.reveal()
    expect((await refreshTestAgent(service, agent, refresh, { scope: 'admin:all' })).status).toBe(
      400,
    )
    const results = await Promise.all([
      refreshTestAgent(service, agent, refresh),
      refreshTestAgent(service, agent, refresh),
    ])
    expect(results.filter((result) => result.status === 200)).toHaveLength(1)
    const rotated = parseTokenResponse(results.find((result) => result.status === 200)!.body)
    const revoke = new URLSearchParams({
      token: rotated.refreshToken!.reveal(),
      client_id: TEST_AGENT,
      client_assertion_type: JWT_CLIENT_ASSERTION,
      client_assertion: await agent.assertion(),
    })
    expect(
      (await service.handle(protocolRequest('/oauth/revoke', {}, revoke.toString()))).status,
    ).toBe(200)
    expect((await refreshTestAgent(service, agent, rotated.refreshToken!.reveal())).status).toBe(
      400,
    )
  })
})
