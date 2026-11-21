import { createHash } from 'node:crypto'
import { GRAPHQL_POST } from '@payloadcms/next/routes'
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from 'jose'
import { describe, expect, it, vi } from 'vitest'
import { OAUTH_SCOPES } from '@/security/constants'
import { seedOIDCClient } from '@/plugins/seedOIDCClient'
import { createMongoSecurityFixture, registerMongoOAuthGrant } from './mongo/utils'

vi.mock('@/utilities/sendAuthEmail', () => ({ sendAuthEmail: vi.fn() }))
vi.mock('next/cache', async (original) => ({
  ...(await original<typeof import('next/cache')>()),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))
vi.mock('@payloadcms/email-nodemailer', () => ({
  nodemailerAdapter: async () => () => ({
    name: 'isolated-email',
    defaultFromAddress: 'fixture@example.test',
    defaultFromName: 'Fixture',
    sendEmail: vi.fn(),
  }),
}))

const clientId = 'browser-frontend-fixture'
vi.stubEnv('OIDC_CLIENT_ID', clientId)
vi.stubEnv('OIDC_CLIENT_SECRET', 'legacy-backend-only-client-secret')
const payload = await createMongoSecurityFixture()
const graphqlPost = GRAPHQL_POST(Promise.resolve(payload.config))
const readCurrentUser = async (authorization: string, cookie = '') => {
  const response = await graphqlPost(
    new Request('https://backend.example/api/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization,
        cookie,
        origin: 'https://backend.example',
      },
      body: JSON.stringify({ query: 'query MeUser { meUser { user { id email } exp } }' }),
    }),
  )
  return response.json() as Promise<{
    errors?: Array<{ message: string }>
    data?: { meUser: { user: { id: string; email: string } | null; exp: number | null } }
  }>
}
const initializeClient = seedOIDCClient({
  secret: 'isolated-client-seed',
  db: payload.config.db,
}).onInit!
const verifier = 'v'.repeat(64)
const request = (path: string, body?: object, cookie = '') =>
  payload.betterAuth.handler(
    new Request(`https://backend.example/api/auth${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        origin: 'https://backend.example',
        cookie,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  )

const authorize = async (cookie: string, overrides: Record<string, string> = {}) => {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: 'https://frontend.example',
    scope: OAUTH_SCOPES.join(' '),
    state: 'browser-login-state',
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    ...overrides,
  })
  return request(`/oauth2/authorize?${query}`, undefined, cookie)
}

const authorizationCode = async (cookie: string) => {
  const response = await authorize(cookie)
  expect(response.status, await response.clone().text()).toBe(302)
  const callback = new URL(response.headers.get('location')!)
  expect(callback.origin).toBe('https://frontend.example')
  expect(callback.searchParams.get('state')).toBe('browser-login-state')
  expect(callback.searchParams.get('code')).toBeTruthy()
  return callback.searchParams.get('code')!
}

describe('Browser OAuth client registration and PKCE', () => {
  it('exchanges and refreshes the configured browser client without a secret', async () => {
    const user = await registerMongoOAuthGrant(payload)
    const code = await authorizationCode(user.cookie)
    const input = {
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: 'https://frontend.example',
      code,
      code_verifier: verifier,
    }
    const exchanged = await request('/oauth2/token', input)
    expect(exchanged.status, await exchanged.clone().text()).toBe(200)
    const issued: { access_token: string; refresh_token: string; id_token: string } =
      await exchanged.json()
    expect(issued.access_token).toBeTruthy()
    const publicKeys = await request('/jwks')
    expect(publicKeys.status).toBe(200)
    const keys: JSONWebKeySet = await publicKeys.json()
    expect(keys.keys.length).toBeGreaterThan(0)
    expect(keys.keys.every((key) => !key.d)).toBe(true)
    const verified = await jwtVerify(issued.id_token, createLocalJWKSet(keys), {
      issuer: 'https://backend.example/api/auth',
      audience: clientId,
      algorithms: ['RS256'],
    })
    expect(verified.payload).toMatchObject({ sub: user.userId, email_verified: true })
    const currentUser = await readCurrentUser(`Bearer ${issued.access_token}`)
    expect(currentUser.errors).toBeUndefined()
    expect(currentUser.data?.meUser.user?.id).toBe(user.userId)
    expect(currentUser.data?.meUser.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
    expect((await request('/oauth2/token', input)).status).toBe(401)

    const refreshInput = {
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: issued.refresh_token,
    }
    const refreshed = await request('/oauth2/token', refreshInput)
    expect(refreshed.status, await refreshed.clone().text()).toBe(200)
    const replacement: { access_token: string; refresh_token: string } = await refreshed.json()
    expect(replacement.refresh_token).not.toBe(issued.refresh_token)
    const authenticated = await payload.auth({
      headers: new Headers({ authorization: `Bearer ${replacement.access_token}` }),
    })
    expect(authenticated.user?.id).toBe(user.userId)
    const refreshedUser = await readCurrentUser(`Bearer ${replacement.access_token}`)
    expect(refreshedUser.errors).toBeUndefined()
    expect(refreshedUser.data?.meUser.user?.id).toBe(user.userId)
    expect((await readCurrentUser(`Bearer ${issued.access_token}`)).data?.meUser.user).toBeNull()
    expect((await request('/oauth2/token', refreshInput)).status).toBe(401)
  })

  it('keeps invalid bearer tokens anonymous and still supports the verified browser session', async () => {
    const user = await registerMongoOAuthGrant(payload)
    const invalid = await readCurrentUser('Bearer invalid-opaque-token')
    expect(invalid.errors).toBeUndefined()
    expect(invalid.data?.meUser.user).toBeNull()
    const session = await readCurrentUser('', user.cookie)
    expect(session.errors).toBeUndefined()
    expect(session.data?.meUser.user?.id).toBe(user.userId)
  })

  it.each([undefined, 'incorrect-verifier'.repeat(4)])(
    'rejects a missing or incorrect PKCE verifier (%s)',
    async (codeVerifier) => {
      const user = await registerMongoOAuthGrant(payload)
      const code = await authorizationCode(user.cookie)
      const response = await request('/oauth2/token', {
        grant_type: 'authorization_code',
        client_id: clientId,
        redirect_uri: 'https://frontend.example',
        code,
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      })
      expect(response.status).toBeGreaterThanOrEqual(400)
      expect(await response.json()).toMatchObject({ error: 'invalid_request' })
    },
  )

  it('rejects authorization without a PKCE challenge or with an unregistered redirect', async () => {
    const user = await registerMongoOAuthGrant(payload)
    const noPKCE = await authorize(user.cookie, { code_challenge: '', code_challenge_method: '' })
    const badRedirect = await authorize(user.cookie, {
      redirect_uri: 'https://attacker.example/callback',
    })
    expect(noPKCE.headers.get('location') || '').not.toContain('code=')
    expect(badRedirect.headers.get('location') || '').not.toContain('code=')
    expect(noPKCE.status).toBe(302)
    expect(new URL(noPKCE.headers.get('location')!).searchParams.get('error')).toBe(
      'invalid_request',
    )
    expect(badRedirect.status).toBeGreaterThanOrEqual(400)
  })

  it('reconciles an existing confidential registration in place and leaves other clients unchanged', async () => {
    const configured = await payload.find({
      collection: 'oauthApplications',
      where: { clientId: { equals: clientId } },
      limit: 1,
    })
    const existing = configured.docs[0]!
    const other = await registerMongoOAuthGrant(payload)
    await payload.update({
      collection: 'oauthApplications',
      id: existing.id,
      data: {
        type: 'web',
        clientSecret: 'old-secret',
        redirectUrls: 'https://old-frontend.example',
      },
    })
    await initializeClient(payload)
    await initializeClient(payload)
    const repaired = await payload.find({
      collection: 'oauthApplications',
      where: { clientId: { equals: clientId } },
      limit: 2,
    })
    expect(repaired.docs).toHaveLength(1)
    expect(repaired.docs[0]).toMatchObject({
      id: existing.id,
      type: 'public',
      clientSecret: '',
      redirectUrls: 'https://frontend.example',
    })
    const unaffected = await other.context.adapter.findOne<{ type: string; clientSecret: string }>({
      model: 'oauthApplication',
      where: [{ field: 'clientId', value: other.clientId }],
    })
    expect(unaffected?.type).toBe('web')
    expect(unaffected?.clientSecret).toBeTruthy()
  })

  it('does not expose stored signing keys through the collection API to regular users', async () => {
    const account = await registerMongoOAuthGrant(payload)
    const user = await payload.findByID({ collection: 'users', id: account.userId })
    expect(user.role).not.toContain('admin')
    await expect(payload.find({ collection: 'jwks', overrideAccess: false })).rejects.toMatchObject(
      { status: 403 },
    )
    await expect(
      payload.find({
        collection: 'jwks',
        user: { ...user, collection: 'users' },
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
  })
})
