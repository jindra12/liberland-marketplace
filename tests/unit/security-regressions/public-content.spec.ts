import { describe, expect, it, vi } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'
import * as graphQL from 'graphql'
import {
  getPayload,
  type GraphQLExtension,
  type PaginatedDocs,
  type Payload,
  type PayloadRequest,
} from 'payload'
import type {
  Company,
  CompanyLike,
  NotificationSubscription,
  Post,
  Subscriber,
  User,
} from '@/payload-types'
import { GET as share } from '@/app/api/share/route'
import { likesGraphQLMutations, likesGraphQLQueries } from '@/likes/graphql'
import { getNotificationRecipientsForTarget } from '@/newsletter/notificationSubscriptions'

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  getPayload: vi.fn(),
}))
vi.mock('@/app/api/share/security', () => ({
  resolveSafeURL: async (url: string) => new URL(url),
}))
vi.mock('@/security/utils', async (original) => ({
  ...(await original<typeof import('@/security/utils')>()),
  fetchPublicResource: async () => ({
    response: new Response(null, { headers: { 'content-type': 'text/html' } }),
    bytes: new TextEncoder().encode(
      '<html><title>Fixture article</title><body>Fixture article</body></html>',
    ).buffer,
  }),
}))

describe('Public content authorization and side effects', () => {
  it('does not create a published repost from an ambient-authenticated GET request', async () => {
    const payload = mockDeep<Payload>()
    payload.auth.mockResolvedValue(
      mock<Awaited<ReturnType<Payload['auth']>>>({
        user: mock<User & { collection: 'users' }>({
          id: 'user',
          role: ['user'],
          bot: false,
          collection: 'users',
        }),
      }),
    )
    payload.find.mockResolvedValue(
      mock<PaginatedDocs<Company>>({
        docs: [mock<Company>({ id: 'company', name: 'Company', noAutoPost: false })],
      }),
    )
    payload.create.mockResolvedValue(mock<Post>({ id: 'new-post' }))
    vi.mocked(getPayload).mockResolvedValue(payload)
    const response = await share(
      new Request(
        'https://backend.example/api/share?link=https%3A%2F%2Farticle.example%2Fpost&companyId=company',
        { headers: { cookie: 'fixture-session=ambient' } },
      ),
    )
    expect({ status: response.status, writes: payload.create.mock.calls.length }).toEqual({
      status: 405,
      writes: 0,
    })
  })

  it('requires target visibility before exposing like status for a private document', async () => {
    const req = mockDeep<PayloadRequest>()
    req.user = null
    req.payload.findByID.mockResolvedValue(mock<Company>({ id: 'private-company', likeCount: 7 }))
    // Payload erases extension field types; GraphQL validates them when constructing this schema.
    const fields = likesGraphQLQueries(
      graphQL,
      mock<Parameters<GraphQLExtension>[1]>(),
    ) as graphQL.GraphQLFieldConfigMap<null, { req: PayloadRequest }>
    const schema = new graphQL.GraphQLSchema({
      query: new graphQL.GraphQLObjectType({ name: 'Query', fields }),
    })
    const result = await graphQL.graphql({
      schema,
      source: '{ likeStatus(collection: companies, id: "private-company") { likeCount } }',
      contextValue: { req },
    })
    expect(result.errors).toBeUndefined()
    expect(req.payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ overrideAccess: false, req }),
    )
  })

  it('does not write a like before checking that its target is readable', async () => {
    const req = mockDeep<PayloadRequest>()
    req.context = {}
    req.user = mock<User & { collection: 'users' }>({
      id: 'mallory',
      role: ['user'],
      emailVerified: true,
      collection: 'users',
    })
    req.payload.find.mockResolvedValue(
      Object.assign(mock<PaginatedDocs<CompanyLike>>(), { docs: [] }),
    )
    req.payload.findByID.mockRejectedValue(new Error('Target is not readable by this user'))
    const mutations = likesGraphQLMutations(
      graphQL,
      mock<Parameters<GraphQLExtension>[1]>(),
    ) as graphQL.GraphQLFieldConfigMap<null, { req: PayloadRequest }>
    const schema = new graphQL.GraphQLSchema({
      query: new graphQL.GraphQLObjectType({
        name: 'Query',
        fields: { ready: { type: graphQL.GraphQLBoolean } },
      }),
      mutation: new graphQL.GraphQLObjectType({ name: 'Mutation', fields: mutations }),
    })
    const result = await graphQL.graphql({
      schema,
      source:
        'mutation { setLikeState(collection: companies, id: "private-company", liked: true) { hasLiked } }',
      contextValue: { req },
    })
    expect(result.errors).toBeDefined()
    expect(req.payload.create).not.toHaveBeenCalled()
  })

  it('does not silently drop subscribers beyond the first page', async () => {
    const req = mockDeep<PayloadRequest>()
    const subscriptions = Array.from({ length: 1001 }, (_, index) =>
      mock<NotificationSubscription>({
        id: `subscription-${index}`,
        email: `reader-${index}@example.test`,
        subscriber: `reader-${index}`,
      }),
    )
    const subscribers = subscriptions.map((_, index) =>
      mock<Subscriber>({
        id: `reader-${index}`,
        isActive: true,
        email: `reader-${index}@example.test`,
      }),
    )
    req.payload.find.mockImplementation(async (options) => {
      if (options.collection === 'notification-subscriptions') {
        const docs =
          options.pagination === false
            ? subscriptions
            : options.page === 2
              ? subscriptions.slice(1000)
              : subscriptions.slice(0, 1000)
        return mock<PaginatedDocs<NotificationSubscription>>({
          docs,
          hasNextPage: options.pagination !== false && options.page !== 2,
          nextPage: 2,
          totalDocs: 1001,
        })
      }
      return mock<PaginatedDocs<Subscriber>>({ docs: subscribers, hasNextPage: false })
    })
    expect(
      await getNotificationRecipientsForTarget({
        req,
        targetCollection: 'companies',
        targetID: 'company',
      }),
    ).toHaveLength(1001)
  })
})
