import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { createLocalReq } from 'payload'
import { configToSchema } from '@payloadcms/graphql'
// Match the CommonJS GraphQL instance used by Payload's externalized schema package.
import { graphql } from 'graphql/index.js'
import { createMongoSecurityFixture } from './mongo/utils'

vi.mock('@/utilities/sendAuthEmail', () => ({ sendAuthEmail: vi.fn() }))
vi.mock('@payloadcms/email-nodemailer', () => ({
  nodemailerAdapter: async () => () => ({
    name: 'post-provenance-test-email',
    defaultFromAddress: 'unit@example.test',
    defaultFromName: 'Unit tests',
    sendEmail: vi.fn(),
  }),
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

const payload = await createMongoSecurityFixture()
const postId = new Types.ObjectId()

beforeAll(async () => {
  await payload.db.collections.posts.collection.insertOne({
    _id: postId,
    title: 'Post provenance fixture',
    slug: 'post-provenance-fixture',
    content: 'Published fixture content',
    company: new Types.ObjectId(),
    authors: [],
    _status: 'published',
    serverURL: 'https://forged.example',
  })
})

describe('Post backend provenance', () => {
  it('returns the configured backend on public reads instead of a stored source claim', async () => {
    const post = await payload.findByID({
      collection: 'posts',
      id: postId.toHexString(),
      overrideAccess: false,
      depth: 0,
    })
    expect(post).toMatchObject({ id: postId.toHexString(), serverURL: 'https://backend.example' })
  })

  it('exposes the virtual source through actual GraphQL detail and list resolvers', async () => {
    const req = await createLocalReq({}, payload)
    const { schema } = configToSchema(payload.config)
    const result = await graphql({
      schema,
      source:
        'query PostSource($id: String!) { Post(id: $id) { id serverURL } Posts { docs { id serverURL } } }',
      variableValues: { id: postId.toHexString() },
      contextValue: { req },
    })
    expect(result.errors).toBeUndefined()
    expect(result.data).toMatchObject({
      Post: { id: postId.toHexString(), serverURL: 'https://backend.example' },
      Posts: { docs: [{ id: postId.toHexString(), serverURL: 'https://backend.example' }] },
    })
  })
})
