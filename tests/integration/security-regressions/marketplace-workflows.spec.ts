import { createHash, randomUUID } from 'node:crypto'
import { GRAPHQL_POST } from '@payloadcms/next/routes'
import { ObjectId } from 'mongodb'
import { createLocalReq } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { OAUTH_SCOPES } from '@/security/constants'
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

const payload = await createMongoSecurityFixture()
const graphqlPost = GRAPHQL_POST(Promise.resolve(payload.config))
const search = async (where: string) => {
  const response = await graphqlPost(
    new Request('https://backend.example/api/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: `query { Searches(where: ${where}) { docs { title } totalDocs } }`,
      }),
    }),
  )
  return response.json() as Promise<{
    errors?: Array<{ message: string }>
    data?: { Searches: { totalDocs: number; docs: Array<{ title: string }> } }
  }>
}
const authRequest = (path: string, body?: object, cookie = '') =>
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

describe('Marketplace authentication, search and draft workflows', () => {
  it('exchanges a real authorization code once and rejects its replay', async () => {
    const grant = await registerMongoOAuthGrant(payload)
    const verifier = 'v'.repeat(64)
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: grant.clientId,
      redirect_uri: 'https://client.example/callback',
      scope: OAUTH_SCOPES.join(' '),
      state: 'workflow-state',
      code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    })
    const authorization = await authRequest(`/oauth2/authorize?${query}`, undefined, grant.cookie)
    expect(authorization.status).toBe(302)
    const consentURL = new URL(authorization.headers.get('location')!, 'https://backend.example')
    const consent = await authRequest(
      '/oauth2/consent',
      {
        accept: true,
        consent_code: consentURL.searchParams.get('consent_code'),
      },
      grant.cookie,
    )
    expect(consent.status).toBe(200)
    const accepted: { redirectURI: string } = await consent.json()
    const input = {
      grant_type: 'authorization_code',
      client_id: grant.clientId,
      client_secret: 'fixture-secret',
      redirect_uri: 'https://client.example/callback',
      code_verifier: verifier,
      code: new URL(accepted.redirectURI).searchParams.get('code'),
    }
    const exchanged = await authRequest('/oauth2/token', input)
    expect(exchanged.status, await exchanged.clone().text()).toBe(200)
    const replay = await authRequest('/oauth2/token', input)
    expect(replay.status).toBe(401)
    expect(await replay.json()).toMatchObject({ error: 'invalid_grant' })
  })

  it('resets a verified account password once, authenticates the replacement and rejects replay', async () => {
    const grant = await registerMongoOAuthGrant(payload)
    const user = await payload.findByID({ collection: 'users', id: grant.userId })
    expect((await authRequest('/request-password-reset', { email: user.email })).status).toBe(200)
    const tokens = await grant.context.adapter.findMany<{ identifier: string; value: string }>({
      model: 'verification',
    })
    const reset = tokens.find(
      (token) => token.value === user.id && token.identifier.startsWith('reset-password:'),
    )!
    const input = {
      token: reset.identifier.slice('reset-password:'.length),
      newPassword: 'replacement-password-123456',
    }
    const changed = await authRequest('/reset-password', input)
    expect(changed.status, await changed.clone().text()).toBe(200)
    expect((await authRequest('/reset-password', input)).status).toBe(400)
    expect(
      (await authRequest('/sign-in/email', { email: user.email, password: input.newPassword }))
        .status,
    ).toBe(200)
    expect(
      (
        await authRequest('/sign-in/email', {
          email: user.email,
          password: 'fixture-password-123456',
        })
      ).status,
    ).toBe(401)
  })

  it('allows only one concurrent consumer of a verification record on standalone MongoDB', async () => {
    const context = await payload.betterAuth.$context
    const identifier = `single-use-${randomUUID()}`
    const record = await context.adapter.create<{ id: string }>({
      model: 'verification',
      data: {
        identifier,
        value: 'single-use-value',
        expiresAt: new Date(Date.now() + 60000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })
    const consumed = await Promise.all(
      [1, 2].map(() =>
        context.adapter.consumeOne({
          model: 'verification',
          where: [{ field: 'id', value: record.id }],
        }),
      ),
    )
    expect(consumed.filter(Boolean)).toHaveLength(1)
    expect(
      await context.adapter.findOne({
        model: 'verification',
        where: [{ field: 'id', value: record.id }],
      }),
    ).toBeNull()
  })

  it.each(['companies', 'products', 'jobs', 'startups', 'posts', 'identities'])(
    'supports the advertised %s GraphQL search filter',
    async (entity) => {
      const id = new ObjectId()
      await payload.db.collections.search.collection.insertOne({
        title: `Workflow ${entity}`,
        doc: { relationTo: entity, value: id },
        priority: 1,
      })
      const result = await search(
        `{ AND: [{ title: { contains: "Workflow" } }, { doc: { relationTo: ${entity} } }] }`,
      )
      expect(result.errors).toBeUndefined()
      expect(result.data?.Searches).toMatchObject({
        totalDocs: 1,
        docs: [{ title: `Workflow ${entity}` }],
      })
    },
  )

  it('keeps private companies out of nested GraphQL search filters', async () => {
    const ids = [new ObjectId(), new ObjectId()]
    await payload.db.collections.companies.collection.insertMany(
      ids.map((_id, index) => ({
        _id,
        name: `Privacy fixture ${index}`,
        isPrivate: Boolean(index),
        _status: 'published',
      })),
    )
    await payload.db.collections.search.collection.insertMany(
      ids.map((id, index) => ({
        title: `Privacy fixture ${index}`,
        doc: { relationTo: 'companies', value: id },
      })),
    )
    const result = await search(
      '{ AND: [{ title: { contains: "Privacy fixture" } }, { doc: { relationTo: companies } }, { doc: { value: { isPrivate: false } } }] }',
    )
    expect(result.errors).toBeUndefined()
    expect(result.data?.Searches).toMatchObject({
      totalDocs: 1,
      docs: [{ title: 'Privacy fixture 0' }],
    })
  })

  it('preserves OR branches while normalizing relationship filters', async () => {
    await payload.db.collections.search.collection.insertMany([
      { title: 'Branch company', doc: { relationTo: 'companies', value: new ObjectId() } },
      { title: 'Branch product', doc: { relationTo: 'products', value: new ObjectId() } },
      { title: 'Branch excluded', doc: { relationTo: 'jobs', value: new ObjectId() } },
    ])
    const result = await search(
      '{ OR: [{ title: { equals: "Branch company" }, doc: { relationTo: companies } }, { title: { equals: "Branch product" }, doc: { relationTo: products } }] }',
    )
    expect(result.errors).toBeUndefined()
    expect(result.data?.Searches.totalDocs).toBe(2)
    expect(result.data?.Searches.docs.map((doc) => doc.title).sort()).toEqual([
      'Branch company',
      'Branch product',
    ])
  })

  it('retains ordinary Payload REST-style filters', async () => {
    await payload.db.collections.search.collection.insertMany([
      { title: 'REST fixture', doc: { relationTo: 'companies', value: new ObjectId() } },
      { title: 'REST fixture', doc: { relationTo: 'products', value: new ObjectId() } },
    ])
    const result = await payload.find({
      collection: 'search',
      overrideAccess: false,
      req: await createLocalReq({}, payload),
      where: {
        and: [{ title: { equals: 'REST fixture' } }, { 'doc.relationTo': { equals: 'companies' } }],
      },
    })
    expect(result.totalDocs).toBe(1)
    expect(result.docs[0].doc.relationTo).toBe('companies')
  })

  it('does not turn unsupported JSON predicates into an unrestricted search', async () => {
    const result = await search('{ doc: { value: { isPrivate: false, unsupported: true } } }')
    expect(result.errors?.length).toBeGreaterThan(0)
  })

  it('lets the creator finish an autosaved company-less draft without granting another user access', async () => {
    const ownerID = new ObjectId()
    const malloryID = new ObjectId()
    const companyID = new ObjectId()
    const malloryCompanyID = new ObjectId()
    await payload.db.collections.users.collection.insertMany(
      [ownerID, malloryID].map((_id) => ({
        _id,
        email: `${_id}@example.test`,
        name: 'Draft user',
        role: ['user'],
        emailVerified: true,
      })),
    )
    await payload.db.collections.companies.collection.insertOne({
      _id: companyID,
      name: 'Owned company',
      createdBy: ownerID,
      isPrivate: false,
      _status: 'published',
    })
    await payload.db.collections.companies.collection.insertOne({
      _id: malloryCompanyID,
      name: 'Other company',
      createdBy: malloryID,
      isPrivate: false,
      _status: 'published',
    })
    const owner = await payload.findByID({ collection: 'users', id: ownerID.toHexString() })
    const mallory = await payload.findByID({ collection: 'users', id: malloryID.toHexString() })
    const req = await createLocalReq({ user: { ...owner, collection: 'users' } }, payload)
    const draft = await payload.create({
      collection: 'products',
      data: {},
      draft: true,
      overrideAccess: false,
      req,
    })
    const attacker = await createLocalReq({ user: { ...mallory, collection: 'users' } }, payload)
    await expect(
      payload.update({
        collection: 'products',
        id: draft.id,
        data: { name: 'Stolen draft' },
        draft: true,
        overrideAccess: false,
        req: attacker,
      }),
    ).rejects.toThrow()
    await expect(
      payload.update({
        collection: 'products',
        id: draft.id,
        data: { company: malloryCompanyID.toHexString() },
        draft: true,
        overrideAccess: false,
        req,
      }),
    ).rejects.toThrow('You can only attach records to companies you own.')
    const updated = await payload.update({
      collection: 'products',
      id: draft.id,
      draft: true,
      overrideAccess: false,
      req,
      data: { name: 'Completed product', company: companyID.toHexString() },
    })
    expect(updated.name).toBe('Completed product')
    await expect(
      payload.update({
        collection: 'products',
        id: draft.id,
        data: { name: 'Stolen' },
        overrideAccess: false,
        req: attacker,
      }),
    ).rejects.toThrow()
  })
})
