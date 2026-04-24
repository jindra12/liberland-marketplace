import { createHash } from 'node:crypto'

import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { CollectionSlug, Payload } from 'payload'
import type { User } from '@/payload-types'

let payload: Payload | null = null
let bootstrapError: Error | null = null
let graphqlPost: ((request: Request) => Promise<Response>) | null = null

const createdOauthAccessTokenIDs: string[] = []
const createdTargetDocs: LikeTargetDoc[] = []
const createdUserIDs: string[] = []

type LikeableTargetCollection =
  | 'companies'
  | 'comments'
  | 'identities'
  | 'jobs'
  | 'posts'
  | 'products'
  | 'startups'
type LikeGraphQLCollection =
  | 'companies'
  | 'comments'
  | 'identities'
  | 'jobs'
  | 'posts'
  | 'products'
  | 'ventures'
type LikeCollectionSlug =
  | 'company-likes'
  | 'comment-likes'
  | 'identity-likes'
  | 'job-likes'
  | 'post-likes'
  | 'product-likes'
  | 'venture-likes'

type LikeTargetDoc = {
  collection: LikeableTargetCollection
  graphqlCollection: LikeGraphQLCollection
  id: string
  likeCollectionSlug: LikeCollectionSlug
}

type LikeDocRecord = {
  id: string
  targetID?: string | null
  userId?: string | null
}

type CollectionListEntry = {
  docs: Array<{
    hasLiked?: boolean | null
    id: string
    likeCount?: number | null
  }>
}

type GraphQLListData = Partial<Record<LikeableTargetCollection, CollectionListEntry>>

type GraphQLResponseBody = {
  data?: {
    companies?: CollectionListEntry
    comments?: CollectionListEntry
    identities?: CollectionListEntry
    jobs?: CollectionListEntry
    likeStatus?: {
      collection: LikeGraphQLCollection
      hasLiked: boolean
      id: string
      likeCount: number
    }
    posts?: CollectionListEntry
    products?: CollectionListEntry
    setLikeState?: {
      collection: LikeGraphQLCollection
      hasLiked: boolean
      id: string
      likeCount: number
    }
    startups?: CollectionListEntry
  }
  errors?: Array<{ message?: string }>
}

const likeableTargetDefinitions: Array<Omit<LikeTargetDoc, 'id'>> = [
  {
    collection: 'companies',
    graphqlCollection: 'companies',
    likeCollectionSlug: 'company-likes',
  },
  {
    collection: 'identities',
    graphqlCollection: 'identities',
    likeCollectionSlug: 'identity-likes',
  },
  {
    collection: 'comments',
    graphqlCollection: 'comments',
    likeCollectionSlug: 'comment-likes',
  },
  {
    collection: 'startups',
    graphqlCollection: 'ventures',
    likeCollectionSlug: 'venture-likes',
  },
  {
    collection: 'jobs',
    graphqlCollection: 'jobs',
    likeCollectionSlug: 'job-likes',
  },
  {
    collection: 'products',
    graphqlCollection: 'products',
    likeCollectionSlug: 'product-likes',
  },
  {
    collection: 'posts',
    graphqlCollection: 'posts',
    likeCollectionSlug: 'post-likes',
  },
]

const quoteGraphQLString = (value: string): string => JSON.stringify(value)

const hashIP = (ip: string): string => createHash('sha256').update(ip).digest('hex')

const createUser = async (label: string): Promise<User> => {
  if (!payload) {
    throw new Error('Payload is not available.')
  }

  const user = await payload.create({
    collection: 'users',
    data: {
      email: `${label}-${crypto.randomUUID()}@example.com`,
      emailVerified: true,
      name: label,
    },
  })

  createdUserIDs.push(user.id)

  return user
}

const createBearerToken = async (user: User): Promise<string> => {
  if (!payload) {
    throw new Error('Payload is not available.')
  }

  const accessToken = `test-oidc-access-token-${crypto.randomUUID()}`

  const tokenRecord = await payload.create({
    collection: 'oauthAccessTokens',
    data: {
      accessToken,
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      scopes: 'openid profile email',
      user: user.id,
    },
  })

  createdOauthAccessTokenIDs.push(tokenRecord.id)

  return accessToken
}

const createSimplePostContent = (title: string): string => `# ${title}`

const createLikeableDocuments = async (): Promise<LikeTargetDoc[]> => {
  if (!payload) {
    throw new Error('Payload is not available.')
  }

  const identity = await payload.create({
    collection: 'identities',
    data: {
      createdBy: 'system',
      description: 'Identity for likes testing.',
      name: `Likes Identity ${crypto.randomUUID()}`,
      website: 'https://example.com/likes-identity',
    },
    draft: false,
  })

  const company = await payload.create({
    collection: 'companies',
    data: {
      _status: 'published',
      createdBy: 'system',
      description: 'Company for likes testing.',
      identity: identity.id,
      name: `Likes Company ${crypto.randomUUID()}`,
      website: 'https://example.com/likes-company',
    },
    draft: false,
  })

  const startup = await payload.create({
    collection: 'startups',
    data: {
      _status: 'published',
      company: company.id,
      createdBy: 'system',
      identity: identity.id,
      stage: 'idea',
      title: `Likes Venture ${crypto.randomUUID()}`,
    },
    draft: false,
  })

  const job = await payload.create({
    collection: 'jobs',
    data: {
      _status: 'published',
      company: company.id,
      createdBy: 'system',
      description: 'Job for likes testing.',
      employmentType: 'full-time',
      positions: 1,
      postedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      title: `Likes Job ${crypto.randomUUID()}`,
    },
    draft: false,
  })

  const product = await payload.create({
    collection: 'products',
    data: {
      _status: 'published',
      company: company.id,
      name: `Likes Product ${crypto.randomUUID()}`,
    },
    draft: false,
  })

  const post = await payload.create({
    collection: 'posts',
    data: {
      _status: 'published',
      company: company.id,
      content: createSimplePostContent(`Likes post ${crypto.randomUUID()}`),
      createdBy: 'system',
      slug: `likes-post-${crypto.randomUUID()}`,
      title: `Likes Post ${crypto.randomUUID()}`,
    },
    draft: false,
  })

  const commentData = {
    content: 'Comment for likes testing.',
    company: company.id,
    replyPost: {
      relationTo: 'posts' as const,
      value: post.id,
    },
  }

  const comment = await payload.create({
    collection: 'comments',
    data: commentData,
    draft: false,
    overrideAccess: true,
  })

  expect((comment as { company?: string | null }).company).toBe(company.id)

  const createdDocs: LikeTargetDoc[] = [
    { collection: 'identities', graphqlCollection: 'identities', id: String(identity.id), likeCollectionSlug: 'identity-likes' },
    { collection: 'comments', graphqlCollection: 'comments', id: String(comment.id), likeCollectionSlug: 'comment-likes' },
    { collection: 'companies', graphqlCollection: 'companies', id: String(company.id), likeCollectionSlug: 'company-likes' },
    { collection: 'startups', graphqlCollection: 'ventures', id: String(startup.id), likeCollectionSlug: 'venture-likes' },
    { collection: 'jobs', graphqlCollection: 'jobs', id: String(job.id), likeCollectionSlug: 'job-likes' },
    { collection: 'products', graphqlCollection: 'products', id: String(product.id), likeCollectionSlug: 'product-likes' },
    { collection: 'posts', graphqlCollection: 'posts', id: String(post.id), likeCollectionSlug: 'post-likes' },
  ]

  createdTargetDocs.push(...createdDocs)

  return createdDocs
}

const runGraphQLOperation = async ({
  headers,
  query,
}: {
  headers?: Record<string, string>
  query: string
}): Promise<{ body: GraphQLResponseBody; response: Response }> => {
  if (!graphqlPost) {
    throw new Error('GraphQL route is not available.')
  }

  const request = new Request('http://localhost:3001/api/graphql', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ query }),
  })

  const response = await graphqlPost(request)
  const body = (await response.json()) as GraphQLResponseBody

  return { body, response }
}

const buildSetLikeStateMutation = ({
  collection,
  id,
  liked,
}: {
  collection: LikeGraphQLCollection
  id: string
  liked: boolean
}): string => `
  mutation {
    setLikeState(collection: ${collection}, id: ${quoteGraphQLString(id)}, liked: ${liked}) {
      collection
      hasLiked
      id
      likeCount
    }
  }
`

const buildLikeStatusQuery = ({
  collection,
  id,
}: {
  collection: LikeGraphQLCollection
  id: string
}): string => `
  query {
    likeStatus(collection: ${collection}, id: ${quoteGraphQLString(id)}) {
      collection
      hasLiked
      id
      likeCount
    }
  }
`

const buildCollectionListQuery = (targets: LikeTargetDoc[]): string => {
  return `
    query {
      ${targets
        .map(
          (target) => `
            ${target.collection}(limit: 1, where: { id: { equals: ${quoteGraphQLString(target.id)} } }) {
              docs {
                id
                hasLiked
                likeCount
              }
            }
          `,
        )
        .join('\n')}
    }
  `
}

const getLikeDocs = async ({
  collection,
  targetID,
}: {
  collection: LikeCollectionSlug
  targetID: string
}): Promise<LikeDocRecord[]> => {
  if (!payload) {
    throw new Error('Payload is not available.')
  }

  const result = await payload.find({
    collection: collection as CollectionSlug,
    depth: 0,
    limit: 10,
    overrideAccess: true,
    where: {
      targetID: {
        equals: targetID,
      },
    },
  })

  return result.docs as LikeDocRecord[]
}

const assertLikeToggle = async ({
  headers,
  expectedUserId,
  target,
}: {
  expectedUserId: string
  headers: Record<string, string>
  target: LikeTargetDoc
}): Promise<void> => {
  if (!payload) {
    throw new Error('Payload is not available.')
  }

  const likeOnResponse = await runGraphQLOperation({
    headers,
    query: buildSetLikeStateMutation({
      collection: target.graphqlCollection,
      id: target.id,
      liked: true,
    }),
  })

  expect(likeOnResponse.response.status).toBe(200)
  expect(likeOnResponse.body.errors).toBeUndefined()
  expect(likeOnResponse.body.data?.setLikeState).toMatchObject({
    collection: target.graphqlCollection,
    hasLiked: true,
    id: target.id,
    likeCount: 1,
  })

  const likedDocs = await getLikeDocs({
    collection: target.likeCollectionSlug,
    targetID: target.id,
  })

  expect(likedDocs).toHaveLength(1)
  expect(likedDocs[0]).toMatchObject({
    targetID: target.id,
    userId: expectedUserId,
  })

  const likedTarget = await payload.findByID({
    collection: target.collection as CollectionSlug,
    depth: 0,
    id: target.id,
    overrideAccess: true,
  })

  expect(likedTarget).toMatchObject({
    id: target.id,
    likeCount: 1,
  })

  const likeStatusResponse = await runGraphQLOperation({
    headers,
    query: buildLikeStatusQuery({
      collection: target.graphqlCollection,
      id: target.id,
    }),
  })

  expect(likeStatusResponse.response.status).toBe(200)
  expect(likeStatusResponse.body.errors).toBeUndefined()
  expect(likeStatusResponse.body.data?.likeStatus).toMatchObject({
    collection: target.graphqlCollection,
    hasLiked: true,
    id: target.id,
    likeCount: 1,
  })

  const unlikeResponse = await runGraphQLOperation({
    headers,
    query: buildSetLikeStateMutation({
      collection: target.graphqlCollection,
      id: target.id,
      liked: false,
    }),
  })

  expect(unlikeResponse.response.status).toBe(200)
  expect(unlikeResponse.body.errors).toBeUndefined()
  expect(unlikeResponse.body.data?.setLikeState).toMatchObject({
    collection: target.graphqlCollection,
    hasLiked: false,
    id: target.id,
    likeCount: 0,
  })

  const unlikedTarget = await payload.findByID({
    collection: target.collection as CollectionSlug,
    depth: 0,
    id: target.id,
    overrideAccess: true,
  })

  expect(unlikedTarget).toMatchObject({
    id: target.id,
    likeCount: 0,
  })

  const unlikedDocs = await getLikeDocs({
    collection: target.likeCollectionSlug,
    targetID: target.id,
  })

  expect(unlikedDocs).toHaveLength(0)

  const unlikedStatusResponse = await runGraphQLOperation({
    headers,
    query: buildLikeStatusQuery({
      collection: target.graphqlCollection,
      id: target.id,
    }),
  })

  expect(unlikedStatusResponse.response.status).toBe(200)
  expect(unlikedStatusResponse.body.errors).toBeUndefined()
  expect(unlikedStatusResponse.body.data?.likeStatus).toMatchObject({
    collection: target.graphqlCollection,
    hasLiked: false,
    id: target.id,
    likeCount: 0,
  })
}

const cleanup = async (): Promise<void> => {
  if (!payload) {
    return
  }

  const currentPayload = payload

  await Promise.all(
    createdOauthAccessTokenIDs.map((id) =>
      currentPayload.delete({
        collection: 'oauthAccessTokens' as CollectionSlug,
        id,
      }),
    ),
  )
  createdOauthAccessTokenIDs.length = 0

  await Promise.all(
    createdUserIDs.map((id) =>
      currentPayload.delete({
        collection: 'users' as CollectionSlug,
        id,
      }),
    ),
  )
  createdUserIDs.length = 0

  await Promise.all(
    Array.from(new Set(createdTargetDocs.map((doc) => doc.likeCollectionSlug))).map((collection) => {
      const targetIDs = createdTargetDocs
        .filter((doc) => doc.likeCollectionSlug === collection)
        .map((doc) => doc.id)

      return currentPayload.db.deleteMany({
        collection: collection as CollectionSlug,
        where: {
          targetID: {
            in: targetIDs,
          },
        },
      })
    }),
  )

  await Promise.all(
    createdTargetDocs.map((doc) =>
      currentPayload.delete({
        collection: doc.collection as CollectionSlug,
        id: doc.id,
      }),
    ),
  )
  createdTargetDocs.length = 0
}

describe('Likes GraphQL access', () => {
  beforeAll(async () => {
    try {
      const [{ getPayload }, configModule, graphqlRouteModule] = await Promise.all([
        import('payload'),
        import('@/payload.config'),
        import('@/app/(payload)/api/graphql/route'),
      ])

      const payloadConfig = await configModule.default
      payload = await getPayload({ config: payloadConfig })
      graphqlPost = graphqlRouteModule.POST
    } catch (error) {
      bootstrapError = error instanceof Error ? error : new Error('Unknown Payload bootstrap error')
    }
  })

  afterEach(async () => {
    await cleanup()
  })

  it('supports authenticated likes and likeCount for every likeable collection', async () => {
    if (bootstrapError || !payload) {
      return
    }

    const user = await createUser('Like GraphQL User')
    const bearerToken = await createBearerToken(user)
    const targets = await createLikeableDocuments()

    await Promise.all(
      targets.map((target) =>
        assertLikeToggle({
          expectedUserId: String(user.id),
          headers: {
            authorization: `Bearer ${bearerToken}`,
          },
          target,
        }),
      ),
    )
  })

  it('supports anonymous likes using a stable IP hash for every likeable collection', async () => {
    if (bootstrapError || !payload) {
      return
    }

    const targets = await createLikeableDocuments()
    const anonymousIP = '203.0.113.10'
    const anonymousUserId = hashIP(anonymousIP)

    await Promise.all(
      targets.map((target) =>
        assertLikeToggle({
          expectedUserId: anonymousUserId,
          headers: {
            'x-forwarded-for': anonymousIP,
          },
          target,
        }),
      ),
    )
  })

  it('returns hasLiked and likeCount on collection list queries', async () => {
    if (bootstrapError || !payload) {
      return
    }

    const user = await createUser('Like List GraphQL User')
    const bearerToken = await createBearerToken(user)
    const targets = await createLikeableDocuments()

    await Promise.all(
      targets.map((target) =>
        runGraphQLOperation({
          headers: {
            authorization: `Bearer ${bearerToken}`,
          },
          query: buildSetLikeStateMutation({
            collection: target.graphqlCollection,
            id: target.id,
            liked: true,
          }),
        }),
      ),
    )

    const listResponse = await runGraphQLOperation({
      headers: {
        authorization: `Bearer ${bearerToken}`,
      },
      query: buildCollectionListQuery(targets),
    })

    expect(listResponse.response.status).toBe(200)
    expect(listResponse.body.errors).toBeUndefined()

    const listData = listResponse.body.data as GraphQLListData | undefined

    targets.forEach((target) => {
      const docs = listData?.[target.collection]?.docs
      expect(docs).toHaveLength(1)
      expect(docs?.[0]).toMatchObject({
        hasLiked: true,
        id: target.id,
        likeCount: 1,
      })
    })
  })
})
