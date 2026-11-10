import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { APIError, createLocalReq } from 'payload'
import { EngineResponse, VectorStoreIndex } from 'llamaindex'
import { mockDeep } from 'vitest-mock-extended'
import { getPayloadInstance } from '@/crypto/payload'
import { hasHashBeenUsed } from '@/crypto/hash'
import { createMongoSecurityFixture, registerMongoOAuthGrant } from './mongo/utils'

const embeddings = vi.hoisted(() => ({ read: vi.fn<(texts: string[]) => Promise<number[][]>>() }))
vi.mock('@llamaindex/openai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@llamaindex/openai')>()
  return {
    ...actual,
    OpenAIEmbedding: vi.fn((options: ConstructorParameters<typeof actual.OpenAIEmbedding>[0]) =>
      new actual.OpenAIEmbedding({
        ...options,
        additionalSessionOptions: {
          ...options?.additionalSessionOptions,
          fetch: async (input, init) => {
            const request = new Request(input, init)
            const body: { input: string | string[] } = await request.json()
            const vectors = await embeddings.read(typeof body.input === 'string' ? [body.input] : body.input)
            return Response.json({ object: 'list',
              data: vectors.map((embedding, index) => ({ object: 'embedding', embedding, index })),
              model: 'text-embedding-3-small', usage: { prompt_tokens: 1, total_tokens: 1 },
            })
          },
        },
      }),
    ),
  }
})

vi.mock('@/crypto/payload', () => ({ getPayloadInstance: vi.fn() }))
vi.mock('@/utilities/sendAuthEmail', () => ({ sendAuthEmail: vi.fn() }))
vi.mock('@payloadcms/email-nodemailer', () => ({
  nodemailerAdapter: async () => () => ({
    name: 'security-test-email',
    defaultFromAddress: 'unit@example.test',
    defaultFromName: 'Unit tests',
    sendEmail: vi.fn(),
  }),
}))

const payload = await createMongoSecurityFixture()

// Real tokenization and SDK handling of 1,001 documents need an integration-test budget.
describe('RAG persistence across service reloads', { timeout: 30_000 }, () => {
  it('embeds a published historical company beyond the first thousand records', async () => {
    vi.stubEnv('CHATGPT_KEY', 'fixture-openai-key-never-sent')
    await payload.db.collections.companies.deleteMany({})
    await payload.db.collections.companies.collection.insertMany(
      Array.from({ length: 1001 }, (_, index) => ({
        _id: new Types.ObjectId(),
        name: index === 1000 ? 'Historical searchable target' : `Recent company ${index}`,
        _status: 'published',
        createdAt: new Date(index === 1000 ? '2000-01-01' : '2026-01-01'),
      })),
    )
    embeddings.read.mockClear()
    embeddings.read.mockImplementation(async (texts) => texts.map(() => [1, 0, 0]))
    const engine = mockDeep<ReturnType<VectorStoreIndex['asQueryEngine']>>()
    engine.query.mockResolvedValue(EngineResponse.fromResponse('Fixture answer', false, []))
    vi.spyOn(VectorStoreIndex.prototype, 'asQueryEngine').mockReturnValue(engine)
    vi.resetModules()
    const { searchRag } = await import('@/ai/rag/service')
    await searchRag(await createLocalReq({}, payload), { query: 'historical company' })
    expect(
      embeddings.read.mock.calls
        .flatMap(([texts]) => texts)
        .some((text) => text.includes('Historical searchable target')),
    ).toBe(true)
  })

  it('does not request new paid embeddings for unchanged persisted content after a cold module load', async () => {
    vi.resetModules()
    embeddings.read.mockClear()
    vi.stubEnv('CHATGPT_KEY', 'fixture-openai-key-never-sent')
    embeddings.read.mockImplementation(async (texts) => texts.map(() => [1, 0, 0]))
    await payload.db.collections.companies.collection.insertOne({
      _id: new Types.ObjectId(),
      name: 'Persistent fixture company',
      description: 'Database-backed RAG fixture.',
      _status: 'published',
    })
    const engine = mockDeep<ReturnType<VectorStoreIndex['asQueryEngine']>>()
    engine.query.mockResolvedValue(EngineResponse.fromResponse('Fixture company', false, []))
    vi.spyOn(VectorStoreIndex.prototype, 'asQueryEngine').mockReturnValue(engine)
    const req = await createLocalReq({}, payload)
    const warm = await import('@/ai/rag/service')
    await warm.searchRag(req, { query: 'fixture company' })
    const originalCalls = embeddings.read.mock.calls.length
    expect(originalCalls).toBeGreaterThan(0)

    vi.resetModules()
    const cold = await import('@/ai/rag/service')
    await cold.searchRag(req, { query: 'fixture company' })

    expect(embeddings.read).toHaveBeenCalledTimes(originalCalls)
  })
})

describe('Payload OAuth client identity round trips', () => {
  it('revokes the browser session through the ordinary POST sign-out endpoint', async () => {
    const fixture = await registerMongoOAuthGrant(payload)
    const { POST } = await import('@/app/(payload)/api/auth/[...all]/route')
    const response = await POST(
      new Request('https://backend.example/api/auth/sign-out', {
        method: 'POST',
        headers: {
          cookie: fixture.cookie,
          origin: 'https://backend.example',
          'content-type': 'application/json',
        },
        body: '{}',
      }),
    )
    expect(response.status).toBe(200)
    const session = await payload.betterAuth.handler(
      new Request('https://backend.example/api/auth/get-session', {
        headers: { cookie: fixture.cookie },
      }),
    )
    expect(await session.json()).toBe(null)
  })

  it('invalidates the browser session through the frontend sign-out redirect', async () => {
    const fixture = await registerMongoOAuthGrant(payload)
    const { GET } = await import('@/app/(payload)/api/auth/[...all]/route')
    const signingOut = GET(
      new Request(
        'https://backend.example/api/auth/sign-out?callbackURL=https%3A%2F%2Ffrontend.example%2F',
        { headers: { cookie: fixture.cookie } },
      ),
    )
    await expect(signingOut).resolves.toMatchObject({ status: 303 })
    const signedOut = await signingOut
    expect(signedOut.headers.get('location')).toBe('https://frontend.example/')
    expect(signedOut.headers.getSetCookie().some((value) => /Max-Age=0/i.test(value))).toBe(true)
    const session = await payload.betterAuth.handler(
      new Request('https://backend.example/api/auth/get-session', {
        headers: { cookie: fixture.cookie },
      }),
    )
    expect(await session.json()).toBe(null)
  })

  it('does not disclose another account OAuth credentials to a regular user', async () => {
    const victim = await registerMongoOAuthGrant(payload)
    const reader = await registerMongoOAuthGrant(payload)
    await payload.db.collections.users.updateOne(
      { _id: new Types.ObjectId(reader.userId) },
      { $set: { role: ['user'] } },
    )
    const user = await payload.findByID({ collection: 'users', id: reader.userId, depth: 0 })
    expect(user.role).toEqual(['user'])
    try {
      const tokens = await payload.find({
        collection: 'oauthAccessTokens',
        user: { ...user, collection: 'users' },
        overrideAccess: false,
        depth: 0,
        where: { accessToken: { equals: victim.accessToken } },
      })
      expect(tokens.docs).toHaveLength(0)
    } catch (error) {
      if (error instanceof APIError && error.status === 403) {
        return
      }
      throw error
    }
  })

  it('returns the public client identifier after storing the token relationship', async () => {
    const fixture = await registerMongoOAuthGrant(payload)
    const grant = await fixture.context.adapter.findOne<{ clientId: string }>({
      model: 'oauthAccessToken',
      where: [{ field: 'accessToken', value: fixture.accessToken }],
    })

    expect(grant?.clientId).toBe(fixture.clientId)
  })

  it('refreshes a valid grant using the registered public client identifier', async () => {
    const fixture = await registerMongoOAuthGrant(payload)
    const response = await payload.betterAuth.handler(
      new Request('https://backend.example/api/auth/oauth2/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://backend.example' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          client_id: fixture.clientId,
          client_secret: 'fixture-secret',
          refresh_token: fixture.refreshToken,
        }),
      }),
    )

    expect({ status: response.status, body: await response.json() }).toMatchObject({
      status: 200,
      body: { token_type: 'Bearer' },
    })
  })

  it('authenticates a refreshed marketplace grant through the actual Payload strategy', async () => {
    const fixture = await registerMongoOAuthGrant(payload)
    const response = await payload.betterAuth.handler(new Request('https://backend.example/api/auth/oauth2/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://backend.example' },
      body: JSON.stringify({ grant_type: 'refresh_token', client_id: fixture.clientId,
        client_secret: 'fixture-secret', refresh_token: fixture.refreshToken }),
    }))
    expect(response.status).toBe(200)
    const token: { access_token: string; scope: string } = await response.json()
    expect(token.scope.split(' ')).toContain('marketplace:access')
    const authenticated = await payload.auth({ headers: new Headers({ authorization: `Bearer ${token.access_token}` }) })
    expect(authenticated.user?.id).toBe(fixture.userId)
  })
})
describe('Mongo-backed commerce access boundaries', () => {
  beforeEach(async () => {
    vi.mocked(getPayloadInstance).mockResolvedValue(payload)
    await payload.db.collections.orders.deleteMany({})
    await payload.db.collections.carts.deleteMany({})
  })

  it.each(['orders', 'carts'] as const)(
    'does not expose guest %s without a capability',
    async (collection) => {
      await payload.db.collections[collection].collection.insertMany([
        {
          _id: new Types.ObjectId(),
          customer: null,
          items: [],
          customerEmail: 'guest@example.test',
          secret: 'private-cart-secret',
        },
        {
          _id: new Types.ObjectId(),
          customer: new Types.ObjectId(),
          items: [],
          customerEmail: 'victim@example.test',
          secret: 'other-private-cart-secret',
        },
      ])

      try {
        const result = await payload.find({ collection, overrideAccess: false, depth: 0 })
        expect(result.docs).toHaveLength(0)
      } catch (error) {
        // Explicit denial and a safely filtered empty collection are both valid.
        if (error instanceof APIError && error.status === 403) {
          return
        }
        throw error
      }
    },
  )

  it.each([
    { status: 'processing', chain: 'ethereum', name: 'an unverified order' },
    { status: 'cancelled', chain: 'ethereum', name: 'a cancelled order' },
    { status: 'completed', chain: 'tron', name: 'an order on another chain' },
  ])('does not reserve an Ethereum hash using $name', async (fixture) => {
    const hash = `0x${'ab'.repeat(32)}`
    await payload.db.collections.orders.collection.insertOne({
      _id: new Types.ObjectId(),
      status: fixture.status,
      items: [],
      paymentProofs: [
        { product: new Types.ObjectId(), chain: fixture.chain, transactionHash: hash },
      ],
    })

    expect(
      await hasHashBeenUsed({
        chain: 'ethereum',
        orderId: new Types.ObjectId().toHexString(),
        transactionHash: hash,
      }),
    ).toBe(false)
  })

  it('still detects a completed payment claim on the same chain', async () => {
    const hash = `0x${'ab'.repeat(32)}`
    await payload.db.collections.orders.collection.insertOne({
      _id: new Types.ObjectId(),
      status: 'completed',
      items: [],
      paymentProofs: [{ product: new Types.ObjectId(), chain: 'ethereum', transactionHash: hash }],
    })

    expect(
      await hasHashBeenUsed({
        chain: 'ethereum',
        orderId: new Types.ObjectId().toHexString(),
        transactionHash: hash,
      }),
    ).toBe(true)
  })

  it('does not combine the chain from one proof with the hash from another proof', async () => {
    const hash = `0x${'ab'.repeat(32)}`
    await payload.db.collections.orders.collection.insertOne({
      _id: new Types.ObjectId(), status: 'completed', items: [],
      paymentProofs: [
        { product: new Types.ObjectId(), chain: 'ethereum', transactionHash: `0x${'cd'.repeat(32)}` },
        { product: new Types.ObjectId(), chain: 'tron', transactionHash: hash },
      ],
    })
    expect(await hasHashBeenUsed({ chain: 'ethereum', transactionHash: hash })).toBe(false)
  })

  it('detects a previously settled Ethereum hash with different casing', async () => {
    const hash = `0x${'AB'.repeat(32)}`
    await payload.db.collections.orders.collection.insertOne({
      _id: new Types.ObjectId(), status: 'completed', items: [],
      paymentProofs: [{ product: new Types.ObjectId(), chain: 'ethereum', transactionHash: hash }],
    })
    expect(await hasHashBeenUsed({ chain: 'ethereum', transactionHash: hash.toLowerCase() })).toBe(true)
  })
})
