import { afterAll, describe, expect, it, vi } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'
import type { CollectionBeforeChangeHook, PayloadRequest } from 'payload'
import type { Comment, User } from '@/payload-types'

vi.mock('@payloadcms/email-nodemailer', () => ({
  nodemailerAdapter: async () => () => ({
    name: 'unit-test-email',
    defaultFromAddress: 'unit@example.test',
    defaultFromName: 'Unit tests',
    sendEmail: vi.fn(),
  }),
}))

vi.stubEnv('BETTER_AUTH_SECRET', 'unit-test-secret-not-a-production-credential')
vi.stubEnv('PAYLOAD_SECRET', 'unit-test-payload-secret')
vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://backend.example')
vi.stubEnv('NEXT_PUBLIC_FRONTEND_URL', 'https://frontend.example')
// Load configuration during module setup, not inside a timed test hook.
// This does not initialize Payload or connect to MongoDB.
const config = await (await import('@/payload.config')).default
afterAll(() => vi.unstubAllEnvs())

describe('Configured collection access boundaries', () => {
  it('does not give regular users unrestricted access to contact-form submissions', async () => {
    const collection = config.collections.find((entry) => entry.slug === 'form-submissions')
    if (!collection?.access?.read) {
      throw new Error('The installed form plugin has no configured submission read policy')
    }
    const req = mockDeep<PayloadRequest>()
    req.user = mock<User & { collection: 'users' }>({
      id: 'mallory',
      role: ['user'],
      collection: 'users',
    })
    expect(await collection.access.read({ req })).toBe(false)
  })

  it.each([
    { slug: 'oauthAccessTokens', operation: 'create' as const },
    { slug: 'accounts', operation: 'update' as const },
    { slug: 'sessions', operation: 'delete' as const },
  ])(
    'does not grant blanket $operation authority on $slug to a regular account',
    async (fixture) => {
      const collection = config.collections.find((entry) => entry.slug === fixture.slug)
      const access = collection?.access?.[fixture.operation]
      if (!access) {
        throw new Error(`Missing actual ${fixture.slug} ${fixture.operation} access policy`)
      }
      const req = mockDeep<PayloadRequest>()
      req.user = mock<User & { collection: 'users' }>({
        id: 'mallory',
        role: ['user'],
        collection: 'users',
      })
      expect(await access({ req, id: 'victim-record', data: { user: 'victim' } })).not.toBe(true)
    },
  )

  it.each(['sessions', 'accounts', 'verifications', 'oauthAccessTokens', 'oauthApplications'])(
    'ordinary users cannot administer the %s authentication collection',
    async (slug) => {
      const collection = config.collections.find((entry) => entry.slug === slug)
      if (!collection?.access?.read) {
        throw new Error(`Missing configured ${slug} read access policy`)
      }
      const req = mockDeep<PayloadRequest>()
      req.user = mock<User & { collection: 'users' }>({
        id: 'mallory',
        role: ['user'],
        collection: 'users',
      })
      expect(await collection.access.read({ req })).toBe(false)
    },
  )

  it.each(['orders', 'carts'])(
    'anonymous callers cannot list %s without a guest capability',
    async (slug) => {
      const collection = config.collections.find((entry) => entry.slug === slug)
      if (!collection?.access?.read) {
        throw new Error(`Missing configured ${slug} read access policy`)
      }
      const req = mockDeep<PayloadRequest>()
      req.user = null
      req.headers = mockDeep<Headers>()
      req.query = {}
      expect(await collection.access.read({ req })).toBe(false)
    },
  )

  it('verified regular users can submit moderation reports', async () => {
    const req = mockDeep<PayloadRequest>()
    req.user = mock<User & { collection: 'users' }>({
      id: 'reporter',
      role: ['user'],
      emailVerified: true,
      collection: 'users',
    })
    const collection = config.collections.find((entry) => entry.slug === 'reports')
    if (!collection?.access?.create) {
      throw new Error('Missing configured reports create access policy')
    }
    expect(await collection.access.create({ req })).toBe(true)
  })

  it.each(['header', 'footer'])(
    'ordinary users cannot modify the global %s navigation',
    async (slug) => {
      const global = config.globals.find((entry) => entry.slug === slug)
      if (!global?.access?.update) {
        throw new Error(`Missing sanitized ${slug} update access policy`)
      }
      const req = mockDeep<PayloadRequest>()
      req.user = mock<User & { collection: 'users' }>({
        id: 'mallory',
        role: ['user'],
        collection: 'users',
      })
      expect(await global.access.update({ req })).toBe(false)
    },
  )

  it('ordinary users cannot run administrative background jobs', async () => {
    const run = config.jobs?.access?.run
    if (!run) {
      throw new Error('Missing configured background-job run policy')
    }
    const req = mockDeep<PayloadRequest>()
    req.user = mock<User & { collection: 'users' }>({
      id: 'mallory',
      role: ['user'],
      collection: 'users',
    })
    expect(await run({ req })).toBe(false)
  })

  it('derives entity-comment lookup fields from the submitted relationship', async () => {
    const collection = config.collections.find((entry) => entry.slug === 'comments')
    const hooks = collection?.hooks?.beforeChange
    if (!hooks?.length) {
      throw new Error('Missing actual comment creation hooks')
    }
    const req = mockDeep<PayloadRequest>()
    req.user = mock<User & { collection: 'users' }>({
      id: 'editor',
      role: ['admin'],
      emailVerified: true,
      collection: 'users',
    })
    const args = Object.assign(mock<Parameters<CollectionBeforeChangeHook>[0]>(), {
      req,
      operation: 'create',
      context: {},
      originalDoc: undefined,
      data: {
        content: 'Fixture comment',
        company: 'company',
        replyPost: { relationTo: 'companies' as const, value: 'target-company' },
      },
    })
    const result = await hooks.reduce<Promise<Partial<Comment>>>(async (previous, hook) => {
      const data = await hook({ ...args, data: await previous })
      if (!data) {
        throw new Error('Comment hook unexpectedly removed its input data')
      }
      return data
    }, Promise.resolve(args.data))
    expect(result).toMatchObject({
      replyPostRelationTo: 'companies',
      replyPostValue: 'target-company',
    })
  })
})
