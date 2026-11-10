import { afterAll, describe, expect, it, vi } from 'vitest'
import { MARKETPLACE_ACCESS_SCOPE } from '@/security/constants'
import {
  createAuthenticationFixture,
  loadConfiguredAuthOptions,
  registerAuthenticationUser,
  resetAuthenticationPassword,
  requestAuthentication,
  seedOAuthGrant,
  authorizeConfidentialClient,
} from './authentication/utils'

vi.mock('payload-auth/better-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('payload-auth/better-auth')>()
  return { ...actual, betterAuthPlugin: vi.fn(actual.betterAuthPlugin) }
})
vi.mock('@/utilities/sendAuthEmail', () => ({ sendAuthEmail: vi.fn() }))
vi.mock('@/poppy/accounts/utils', () => ({ revokePoppyAccountGrants: vi.fn() }))

vi.stubEnv('BETTER_AUTH_SECRET', 'unit-test-auth-secret-not-used-in-production')
vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://auth.example')
vi.stubEnv('OIDC_REDIRECT_URLS', '')
const options = await loadConfiguredAuthOptions()

describe('Authentication lifecycle security', () => {
  afterAll(() => vi.unstubAllEnvs())

  it.each(['correct secret', 'wrong secret', 'wrong verifier', 'replayed code'])(
    'enforces the complete authorization-code and consent journey with %s',
    async (scenario) => {
      const auth = await createAuthenticationFixture(options)
      const account = await registerAuthenticationUser(auth)
      await seedOAuthGrant(auth, account.userId)
      const body = await authorizeConfidentialClient(auth, account.cookie)
      const response = await requestAuthentication(auth, '/oauth2/token', {
        ...body,
        client_secret: scenario === 'wrong secret' ? 'incorrect-secret' : body.client_secret,
        code_verifier: scenario === 'wrong verifier' ? 'x'.repeat(64) : body.code_verifier,
      })
      if (scenario === 'wrong secret' || scenario === 'wrong verifier') {
        expect(response.status).toBeGreaterThanOrEqual(400)
        return
      }
      expect(response.status).toBe(200)
      const token: { access_token: string; refresh_token: string; scope: string } = await response.json()
      expect(token.refresh_token).toBeTruthy()
      expect(token.scope.split(' ')).toContain(MARKETPLACE_ACCESS_SCOPE)
      const identity = await auth.handler(
        new Request('https://auth.example/api/auth/oauth2/userinfo', {
          headers: { authorization: `Bearer ${token.access_token}` },
        }),
      )
      expect(identity.status).toBe(200)
      if (scenario === 'replayed code') {
        const replay = await requestAuthentication(auth, '/oauth2/token', body)
        expect(replay.status).toBeGreaterThanOrEqual(400)
      }
    },
  )

  it('rejects password login until the account proves mailbox ownership', async () => {
    const auth = await createAuthenticationFixture(options)
    await registerAuthenticationUser(auth, false)
    const response = await requestAuthentication(auth, '/sign-in/email', {
      email: 'account@example.test',
      password: 'unit-test-password-12345',
    })
    expect(response.status).toBe(403)
  })

  it('invalidates an existing browser session after a successful password reset', async () => {
    const auth = await createAuthenticationFixture(options)
    const account = await registerAuthenticationUser(auth)
    await resetAuthenticationPassword(auth)
    const session = await requestAuthentication(auth, '/get-session', undefined, account.cookie)
    expect(await session.json()).toBe(null)
  })

  it('invalidates delegated OAuth access after a successful password reset', async () => {
    const auth = await createAuthenticationFixture(options)
    const account = await registerAuthenticationUser(auth)
    await seedOAuthGrant(auth, account.userId)
    await resetAuthenticationPassword(auth)
    const response = await auth.handler(
      new Request('https://auth.example/api/auth/oauth2/userinfo', {
        headers: { authorization: 'Bearer initial-access-token' },
      }),
    )
    expect(response.status).toBe(401)
  })

  it('rejects reuse of a refresh token after exchanging it successfully', async () => {
    const auth = await createAuthenticationFixture(options)
    const account = await registerAuthenticationUser(auth)
    await seedOAuthGrant(auth, account.userId)
    const body = {
      grant_type: 'refresh_token',
      refresh_token: 'initial-refresh-token',
      client_id: 'confidential-client',
      client_secret: 'actual-client-secret',
    }
    const first = await requestAuthentication(auth, '/oauth2/token', body)
    expect(first.status).toBe(200)
    const replay = await requestAuthentication(auth, '/oauth2/token', body)
    expect(replay.status).toBe(401)
  })

  it('requires the registered client secret when refreshing a confidential client grant', async () => {
    const auth = await createAuthenticationFixture(options)
    const account = await registerAuthenticationUser(auth)
    await seedOAuthGrant(auth, account.userId)
    const response = await requestAuthentication(auth, '/oauth2/token', {
      grant_type: 'refresh_token',
      refresh_token: 'initial-refresh-token',
      client_id: 'confidential-client',
      client_secret: 'wrong-client-secret',
    })
    expect(response.status).toBe(401)
  })

  it('does not redirect an unauthenticated silent-login error to an unregistered callback', async () => {
    const auth = await createAuthenticationFixture(options)
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: 'not-registered',
      redirect_uri: 'https://attacker.example/callback',
      prompt: 'none',
      scope: 'openid',
      state: 'unit-test-state',
      code_challenge: 'a'.repeat(43),
      code_challenge_method: 'S256',
    })
    const response = await requestAuthentication(auth, `/oauth2/authorize?${params}`)
    const location = response.headers.get('location')
    if (response.status === 400) {
      expect(location).toBeNull()
      expect(await response.json()).toMatchObject({ error: 'invalid_client' })
      return
    }
    expect(response.status).toBe(302)
    expect(location).toBeTruthy()
    expect(new URL(location!, 'https://auth.example/api/auth/oauth2/authorize').origin).toBe(
      'https://auth.example',
    )
  })
})
