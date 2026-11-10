import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { betterAuthPlugin } from 'payload-auth/better-auth'
import { vi } from 'vitest'
import { createHash } from 'node:crypto'
import { OAUTH_SCOPES } from '@/security/constants'
import { load } from 'cheerio'
import { sendAuthEmail } from '@/utilities/sendAuthEmail'

export const verifyAuthenticationMailbox = async (
  auth: { handler: (request: Request) => Promise<Response> },
  email: string,
) => {
  const message = vi
    .mocked(sendAuthEmail)
    .mock.calls.slice().reverse().find(([mail]) => mail.to === email && mail.subject.startsWith('Verify'))
  const url = message ? load(message[0].html)('a').attr('href') : undefined
  if (!url) {
    throw new Error('The real signup flow did not send a verification link.')
  }
  const response = await auth.handler(new Request(url))
  if (response.status >= 400) {
    throw new Error(`Mailbox verification failed: ${response.status} ${await response.text()}`)
  }
  return response
}

export const loadConfiguredAuthOptions = async () => {
  await import('@/plugins')
  const options = vi.mocked(betterAuthPlugin).mock.calls[0]?.[0].betterAuthOptions
  if (!options) {
    throw new Error('The real authentication plugin was not configured.')
  }
  return options
}

export const createAuthenticationFixture = async (
  options: Awaited<ReturnType<typeof loadConfiguredAuthOptions>>,
) => {
  return betterAuth({
    ...options,
    baseURL: 'https://auth.example',
    database: memoryAdapter({
      user: [],
      account: [],
      session: [],
      verification: [],
      oauthApplications: [],
      oauthAccessTokens: [],
      oauthConsents: [],
    }),
  })
}

export const requestAuthentication = async (
  auth: Awaited<ReturnType<typeof createAuthenticationFixture>>,
  path: string,
  body?: Record<string, string | boolean>,
  cookie?: string,
) =>
  auth.handler(
    new Request(`https://auth.example/api/auth${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        origin: 'https://auth.example',
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  )

export const registerAuthenticationUser = async (
  auth: Awaited<ReturnType<typeof createAuthenticationFixture>>,
  verified = true,
) => {
  const response = await requestAuthentication(auth, '/sign-up/email', {
    email: 'account@example.test',
    name: 'Account fixture',
    password: 'unit-test-password-12345',
  })
  if (!response.ok) {
    throw new Error(`Signup fixture failed: ${response.status} ${await response.text()}`)
  }
  const result: { user: { id: string } } = await response.json()
  const authenticated = verified
    ? await verifyAuthenticationMailbox(auth, 'account@example.test')
    : response
  const cookie = authenticated.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
  return { userId: result.user.id, cookie }
}

export const resetAuthenticationPassword = async (
  auth: Awaited<ReturnType<typeof createAuthenticationFixture>>,
) => {
  const requested = await requestAuthentication(auth, '/request-password-reset', {
    email: 'account@example.test',
  })
  if (!requested.ok) {
    throw new Error(`Password reset request failed: ${requested.status}`)
  }
  const context = await auth.$context
  const records = await context.adapter.findMany<{ identifier: string }>({ model: 'verification' })
  const reset = records.find((record) => record.identifier.startsWith('reset-password:'))
  if (!reset) {
    throw new Error('The real reset handler did not create a password reset token.')
  }
  const changed = await requestAuthentication(auth, '/reset-password', {
    token: reset.identifier.slice('reset-password:'.length),
    newPassword: 'replacement-password-12345',
  })
  if (!changed.ok) {
    throw new Error(`Password reset failed: ${changed.status}`)
  }
}

export const seedOAuthGrant = async (
  auth: Awaited<ReturnType<typeof createAuthenticationFixture>>,
  userId: string,
) => {
  const context = await auth.$context
  await context.adapter.create({
    model: 'oauthApplication',
    data: {
      name: 'Confidential fixture',
      clientId: 'confidential-client',
      clientSecret: 'actual-client-secret',
      type: 'web',
      disabled: false,
      redirectUrls: 'https://client.example/callback',
    },
  })
  await context.adapter.create({
    model: 'oauthAccessToken',
    data: {
      userId,
      clientId: 'confidential-client',
      accessToken: 'initial-access-token',
      refreshToken: 'initial-refresh-token',
      accessTokenExpiresAt: new Date(Date.now() + 3600000),
      refreshTokenExpiresAt: new Date(Date.now() + 86400000),
      scopes: OAUTH_SCOPES.join(' '),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  })
}

export const authorizeConfidentialClient = async (
  auth: Awaited<ReturnType<typeof createAuthenticationFixture>>,
  cookie: string,
) => {
  const verifier = 'v'.repeat(64)
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: 'confidential-client',
    redirect_uri: 'https://client.example/callback',
    scope: OAUTH_SCOPES.join(' '),
    state: 'fixture-state',
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  })
  const response = await requestAuthentication(
    auth,
    `/oauth2/authorize?${query}`,
    undefined,
    cookie,
  )
  if (response.status !== 302 || !response.headers.get('location')) {
    throw new Error(`Authorization fixture failed: ${response.status} ${await response.text()}`)
  }
  const consent = new URL(response.headers.get('location')!, 'https://auth.example')
  const consentCode = consent.searchParams.get('consent_code')
  if (!consentCode) {
    throw new Error(
      'Authorization did not request consent for the newly registered fixture client.',
    )
  }
  const accepted = await requestAuthentication(
    auth,
    '/oauth2/consent',
    {
      accept: true,
      consent_code: consentCode,
    },
    cookie,
  )
  if (!accepted.ok) {
    throw new Error(`Consent fixture failed: ${accepted.status} ${await accepted.text()}`)
  }
  const result: { redirectURI: string } = await accepted.json()
  const callback = new URL(result.redirectURI)
  if (
    callback.origin !== 'https://client.example' ||
    callback.searchParams.get('state') !== 'fixture-state'
  ) {
    throw new Error('Authorization callback did not retain its registered destination/state.')
  }
  const code = callback.searchParams.get('code')
  if (!code) {
    throw new Error('Consent did not issue an authorization code.')
  }
  return {
    grant_type: 'authorization_code',
    client_id: 'confidential-client',
    client_secret: 'actual-client-secret',
    redirect_uri: 'https://client.example/callback',
    code_verifier: verifier,
    code,
  }
}
