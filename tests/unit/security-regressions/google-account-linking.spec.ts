import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import {
  createAuthenticationFixture,
  loadConfiguredAuthOptions,
  registerAuthenticationUser,
  requestAuthentication,
} from './authentication/utils'

vi.mock('payload-auth/better-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('payload-auth/better-auth')>()
  return { ...actual, betterAuthPlugin: vi.fn(actual.betterAuthPlugin) }
})
vi.mock('@/utilities/sendAuthEmail', () => ({ sendAuthEmail: vi.fn() }))
vi.mock('@/poppy/accounts/utils', () => ({ revokePoppyAccountGrants: vi.fn() }))
vi.stubEnv('BETTER_AUTH_SECRET', 'unit-test-auth-secret-not-used-in-production')
vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://auth.example')
vi.stubEnv('GOOGLE_CLIENT_ID', 'fixture-google-client')
vi.stubEnv('GOOGLE_CLIENT_SECRET', 'fixture-google-secret')
const options = await loadConfiguredAuthOptions()
afterAll(() => vi.unstubAllEnvs())
afterEach(() => vi.unstubAllGlobals())

describe('Verified social account linking', () => {
  it('does not preserve an unverified signup password after a verified Google login claims the mailbox', async () => {
    const auth = await createAuthenticationFixture(options)
    await registerAuthenticationUser(auth, false)
    const keys = await generateKeyPair('RS256')
    const jwk = await exportJWK(keys.publicKey)
    const token = await new SignJWT({
      email: 'account@example.test',
      email_verified: true,
      name: 'Verified mailbox owner',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'fixture-google-key' })
      .setIssuer('https://accounts.google.com')
      .setAudience('fixture-google-client')
      .setSubject('google-mailbox-owner')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(keys.privateKey)
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input, init) => {
      const url = new Request(input, init).url
      if (url !== 'https://www.googleapis.com/oauth2/v3/certs') {
        throw new Error(`Unexpected social-login network request: ${url}`)
      }
      return Response.json({ keys: [{ ...jwk, kid: 'fixture-google-key', alg: 'RS256' }] })
    })
    vi.stubGlobal('fetch', fetch)
    const login = await auth.handler(
      new Request('https://auth.example/api/auth/sign-in/social', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://auth.example' },
        body: JSON.stringify({
          provider: 'google',
          idToken: { token, accessToken: 'fixture-google-access-token' },
        }),
      }),
    )
    expect(fetch).toHaveBeenCalled()
    if (!login.ok) {
      // Refusing implicit linking is also a valid fix; unrelated fixture failures are not.
      expect(await login.json()).toMatchObject({
        message: expect.stringMatching(/account not linked|email.*verif/i),
      })
      return
    }
    const passwordLogin = await requestAuthentication(auth, '/sign-in/email', {
      email: 'account@example.test',
      password: 'unit-test-password-12345',
    })
    expect(passwordLogin.status).not.toBe(200)
  })
})
