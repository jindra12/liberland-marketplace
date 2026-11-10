import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'
import {
  JWTAuthentication,
  JWT_AUTH_VERSION,
  buildConfig,
  headersWithCors,
  type Payload,
  type PayloadRequest,
} from 'payload'
import { SignJWT } from 'jose'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import type { User } from '@/payload-types'
import { getTrustedBrowserOrigins, guardCookieAuthStrategy } from '@/security/utils'

describe('Browser cookie origin trust and public federation', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://backend.example')
    vi.stubEnv('NEXT_PUBLIC_FRONTEND_URL', 'https://market.example')
    vi.stubEnv('OIDC_REDIRECT_URLS', 'https://client.example/callback')
  })
  afterEach(() => vi.unstubAllEnvs())

  it.each([
    { origin: 'https://market.example', allowed: true },
    { origin: 'https://mallory.example', allowed: false },
    { origin: '', allowed: false },
  ])('applies the same origin boundary before custom cookie strategies: $origin', async (input) => {
    const authenticate = vi.fn(async () => ({
      user: mock<User & { collection: 'users' }>({ id: 'account', collection: 'users' }),
    }))
    const strategy = guardCookieAuthStrategy({ name: 'cookie-fixture', authenticate })
    const result = await strategy.authenticate({
      payload: mockDeep<Payload>(),
      headers: new Headers({
        cookie: 'better-auth.session_token=fixture',
        origin: input.origin,
        // A made-up bearer header must not bypass the cookie origin boundary.
        authorization: 'Bearer not-an-access-token',
      }),
    })
    expect(Boolean(result.user)).toBe(input.allowed)
    expect(authenticate.mock.calls.length).toBe(input.allowed ? 1 : 0)
  })

  it.each([
    { origin: 'https://market.example', bearer: false, authenticated: true },
    { origin: 'https://mallory.example', bearer: false, authenticated: false },
    { origin: 'https://mallory.example', bearer: true, authenticated: true },
  ])(
    'checks cookie origin without restricting explicit bearer federation: $origin, bearer $bearer',
    async (input) => {
      // Sanitize real auth defaults without initializing Payload or opening a database connection.
      const config = await buildConfig({
        secret: 'isolated-test-secret',
        db: mongooseAdapter({ url: 'mongodb://127.0.0.1:1/unopened-auth-fixture' }),
        collections: [{ slug: 'users', auth: { useSessions: false }, fields: [] }],
        csrf: getTrustedBrowserOrigins(),
        auth: { jwtOrder: ['Bearer', 'cookie'] },
        cookiePrefix: 'fixture',
      })
      const payload: Payload = mockDeep<Payload>()
      payload.secret = config.secret
      payload.config = config
      payload.collections.users = Object.assign(mock<Payload['collections']['users']>(), {
        config: config.collections.find((collection) => collection.slug === 'users')!,
      })
      vi.mocked(payload.findByID).mockResolvedValue(mock<User>({ id: 'account' }))
      const token = await new SignJWT({ id: 'account', collection: 'users' })
        .setProtectedHeader({ alg: 'HS256', authVersion: JWT_AUTH_VERSION })
        .setExpirationTime('5m')
        .sign(new TextEncoder().encode(payload.secret))
      const result = await JWTAuthentication({
        payload,
        headers: new Headers({
          origin: input.origin,
          DisableAutologin: 'true',
          ...(input.bearer
            ? { authorization: `Bearer ${token}` }
            : { cookie: `fixture-token=${token}` }),
        }),
      })
      expect(Boolean(result.user)).toBe(input.authenticated)
      expect(vi.mocked(payload.findByID).mock.calls.length).toBe(input.authenticated ? 1 : 0)
    },
  )

  it('retains anonymous and bearer-readable CORS without credentialed wildcard access', () => {
    const req = Object.assign(mock<PayloadRequest>(), {
      payload: mockDeep<Payload>(),
      headers: new Headers({ origin: 'https://new-syndicated-market.example' }),
    })
    req.payload.config.cors = '*'
    const headers = headersWithCors({ headers: new Headers(), req })
    expect(headers.get('access-control-allow-origin')).toBe('*')
    expect(headers.has('access-control-allow-credentials')).toBe(false)
    expect(headers.get('access-control-allow-headers')).toContain('Authorization')
  })
})
