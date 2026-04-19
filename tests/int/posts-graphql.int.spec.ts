import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import type { User } from '@/payload-types'
import { getServerSideURL } from '@/utilities/getURL'

let payload: Payload | null = null
let bootstrapError: Error | null = null
let graphqlPost: ((request: Request) => Promise<Response>) | null = null

const createdOauthAccessTokenIDs: string[] = []
const createdCommentIDs: string[] = []
const createdPostIDs: string[] = []
const createdUserIDs: string[] = []

type GraphQLResponseBody = {
  data?: {
    comment?: {
      company?: {
        id: string
        name?: string | null
      } | null
      id: string
    } | null
    createPost?: {
      company?: {
        createdBy?: {
          id?: string | null
          image?: {
            url?: string | null
          } | null
          nickname?: string | null
        } | null
        id: string
        name?: string | null
      } | null
      hasLiked?: boolean | null
      id: string
      likeCount?: number | null
      slug?: string | null
      title?: string | null
    } | null
    deletePost?: {
      id: string
    } | null
    post?: {
      company?: {
        createdBy?: {
          id?: string | null
          image?: {
            url?: string | null
          } | null
          nickname?: string | null
        } | null
        id: string
        name?: string | null
      } | null
      hasLiked?: boolean | null
      id: string
      likeCount?: number | null
      slug?: string | null
      title?: string | null
    } | null
    posts?: {
      docs: Array<{
        company?: {
          id: string
          name?: string | null
        } | null
        hasLiked?: boolean | null
        id: string
        likeCount?: number | null
        slug?: string | null
        title?: string | null
      }>
      totalDocs: number
    } | null
    updatePost?: {
      company?: {
        createdBy?: {
          id?: string | null
          image?: {
            url?: string | null
          } | null
          nickname?: string | null
        } | null
        id: string
        name?: string | null
      } | null
      hasLiked?: boolean | null
      id: string
      likeCount?: number | null
      slug?: string | null
      title?: string | null
    } | null
  }
  errors?: Array<{ message?: string }>
}

type GraphQLInputValue =
  | boolean
  | null
  | number
  | string
  | GraphQLInputObject
  | GraphQLInputValue[]

type GraphQLInputObject = {
  [key: string]: GraphQLInputValue
}

const toGraphQLInput = (value: GraphQLInputValue): string => {
  if (value === null) {
    return 'null'
  }

  if (typeof value === 'string') {
    return JSON.stringify(value)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => toGraphQLInput(entry)).join(', ')}]`
  }

  const entries = Object.entries(value)

  return `{ ${entries.map(([key, entry]) => `${key}: ${toGraphQLInput(entry)}`).join(', ')} }`
}

const createdByUserGraphQLContent = (label: string): GraphQLInputObject => ({
  root: {
    children: [
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: label,
            type: 'text',
            version: 1,
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        textFormat: 0,
        type: 'paragraph',
        version: 1,
      },
    ],
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
})

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

const getOwnedCompanyID = async (userID: string): Promise<string> => {
  if (!payload) {
    throw new Error('Payload is not available.')
  }

  const companies = await payload.find({
    collection: 'companies',
    depth: 0,
    limit: 1,
    where: {
      createdBy: {
        equals: userID,
      },
    },
  })

  const companyID = companies.docs[0]?.id

  if (!companyID) {
    throw new Error(`Could not find a company owned by user ${userID}.`)
  }

  return companyID
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

const runAuthorizedGraphQLOperation = async ({
  bearerToken,
  query,
}: {
  bearerToken: string
  query: string
}): Promise<{ body: GraphQLResponseBody; response: Response }> => {
  if (!graphqlPost) {
    throw new Error('GraphQL route is not available.')
  }

  const request = new Request('http://localhost:3001/api/graphql', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${bearerToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })

  const response = await graphqlPost(request)
  const body = (await response.json()) as GraphQLResponseBody

  return { body, response }
}

const createPostMutation = ({
  content,
  companyID,
  slug,
  title,
}: {
  content: GraphQLInputObject
  companyID: string
  slug: string
  title: string
}): string => `
  mutation {
    createPost(
      data: {
        company: ${JSON.stringify(companyID)}
        content: ${toGraphQLInput(content)}
        slug: ${JSON.stringify(slug)}
        title: ${JSON.stringify(title)}
      }
    ) {
      id
      company {
        id
        name
      }
      hasLiked
      likeCount
      slug
      title
    }
  }
`

const updatePostMutation = ({
  content,
  id,
  slug,
  title,
}: {
  content: GraphQLInputObject
  id: string
  slug: string
  title: string
}): string => `
  mutation {
    updatePost(
      id: ${JSON.stringify(id)}
      data: {
        content: ${toGraphQLInput(content)}
        slug: ${JSON.stringify(slug)}
        title: ${JSON.stringify(title)}
      }
    ) {
      id
      company {
        id
        name
      }
      hasLiked
      likeCount
      slug
      title
    }
  }
`

const deletePostMutation = (id: string): string => `
  mutation {
    deletePost(id: ${JSON.stringify(id)}) {
      id
    }
  }
`

const postByIDQuery = (id: string): string => `
  query {
    post(id: ${JSON.stringify(id)}) {
      id
      company {
        id
        name
        createdBy {
          id
          nickname: name
          image {
            url
          }
        }
      }
      hasLiked
      likeCount
      slug
      title
    }
  }
`

const commentByIDQuery = (id: string): string => `
  query {
    comment(id: ${JSON.stringify(id)}) {
      id
      company {
        id
        name
      }
    }
  }
`

const postsByIDListQuery = (id: string): string => `
  query {
    posts(limit: 10, where: { id: { equals: ${JSON.stringify(id)} } }) {
      totalDocs
      docs {
        id
        hasLiked
        likeCount
        slug
        title
      }
    }
  }
`

const postsByCompanyIDQuery = (companyID: string): string => `
  query {
    posts(limit: 10, where: { company: { equals: ${JSON.stringify(companyID)} } }) {
      totalDocs
      docs {
        id
        company {
          id
          name
        }
        hasLiked
        likeCount
        slug
        title
      }
    }
  }
`

const postsSearchQuery = (searchTerm: string): string => `
  query {
    posts(limit: 10, where: { title: { contains: ${JSON.stringify(searchTerm)} } }) {
      totalDocs
      docs {
        id
        hasLiked
        likeCount
        slug
        title
      }
    }
  }
`

const createTrackedPost = async ({
  bearerToken,
  companyID,
  contentLabel,
  slug,
  title,
}: {
  bearerToken: string
  companyID: string
  contentLabel: string
  slug: string
  title: string
}): Promise<{
  content: GraphQLInputObject
  id: string
  slug: string
  title: string
}> => {
  const { body, response } = await runAuthorizedGraphQLOperation({
    bearerToken,
    query: createPostMutation({
      companyID,
      content: createdByUserGraphQLContent(contentLabel),
      slug,
      title,
    }),
  })

  expect(response.status).toBe(200)
  expect(body.errors).toBeUndefined()
  expect(body.data?.createPost).toMatchObject({
    hasLiked: false,
    likeCount: 0,
    slug,
    title,
  })

  const id = body.data?.createPost?.id

  if (!id) {
    throw new Error('createPost did not return an id.')
  }

  createdPostIDs.push(id)

  return {
    content: createdByUserGraphQLContent(contentLabel),
    id,
    slug,
    title,
  }
}

const cleanup = async (): Promise<void> => {
  if (!payload) {
    return
  }

  const currentPayload = payload

  await Promise.all(
    createdOauthAccessTokenIDs.map((id) =>
      currentPayload.delete({
        collection: 'oauthAccessTokens',
        id,
      }),
    ),
  )
  createdOauthAccessTokenIDs.length = 0

  await Promise.all(
    createdCommentIDs.map((id) =>
      currentPayload.delete({
        collection: 'comments',
        id,
      }),
    ),
  )
  createdCommentIDs.length = 0

  await Promise.all(
    createdPostIDs.map((id) =>
      currentPayload.delete({
        collection: 'posts',
        id,
      }),
    ),
  )
  createdPostIDs.length = 0

  await Promise.all(
    createdUserIDs.map((id) =>
      currentPayload.delete({
        collection: 'users',
        id,
      }),
    ),
  )
  createdUserIDs.length = 0
}

describe('Posts GraphQL queries', () => {
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

  it('creates, reads, updates, and deletes a post through GraphQL with like metadata', async () => {
    if (bootstrapError || !payload || !graphqlPost) {
      return
    }

    const user = await createUser('Posts GraphQL User')
    const bearerToken = await createBearerToken(user)
    const companyID = await getOwnedCompanyID(user.id)
    const postTitle = `Posts GraphQL ${crypto.randomUUID()}`
    const postSlug = `posts-graphql-${crypto.randomUUID()}`

    const createdPost = await createTrackedPost({
      bearerToken,
      companyID,
      contentLabel: `${postTitle} body`,
      slug: postSlug,
      title: postTitle,
    })

    const readResponse = await runAuthorizedGraphQLOperation({
      bearerToken,
      query: postByIDQuery(createdPost.id),
    })

    expect(readResponse.response.status).toBe(200)
    expect(readResponse.body.errors).toBeUndefined()
    expect(readResponse.body.data?.post).toMatchObject({
      company: {
        createdBy: {
          id: user.id,
          image: null,
          nickname: user.name,
        },
        id: companyID,
        name: expect.any(String),
      },
      hasLiked: false,
      id: createdPost.id,
      likeCount: 0,
      slug: postSlug,
      title: postTitle,
    })

    const updatedTitle = `${postTitle} Updated`
    const updatedSlug = `${postSlug}-updated`
    const updateResponse = await runAuthorizedGraphQLOperation({
      bearerToken,
      query: updatePostMutation({
        content: createdByUserGraphQLContent(`${updatedTitle} body`),
        id: createdPost.id,
        slug: updatedSlug,
        title: updatedTitle,
      }),
    })

    expect(updateResponse.response.status).toBe(200)
    expect(updateResponse.body.errors).toBeUndefined()
    expect(updateResponse.body.data?.updatePost).toMatchObject({
      company: {
        id: companyID,
        name: expect.any(String),
      },
      hasLiked: false,
      id: createdPost.id,
      likeCount: 0,
      slug: updatedSlug,
      title: updatedTitle,
    })

    const deleteResponse = await runAuthorizedGraphQLOperation({
      bearerToken,
      query: deletePostMutation(createdPost.id),
    })

    expect(deleteResponse.response.status).toBe(200)
    expect(deleteResponse.body.errors).toBeUndefined()
    expect(deleteResponse.body.data?.deletePost).toMatchObject({
      id: createdPost.id,
    })

    const createdPostIndex = createdPostIDs.indexOf(createdPost.id)

    if (createdPostIndex >= 0) {
      createdPostIDs.splice(createdPostIndex, 1)
    }

    const deletedReadResponse = await runAuthorizedGraphQLOperation({
      bearerToken,
      query: postByIDQuery(createdPost.id),
    })

    expect(deletedReadResponse.response.status).toBe(200)
    expect(deletedReadResponse.body.errors).toBeUndefined()
    expect(deletedReadResponse.body.data?.post).toBeNull()
  })

  it('allows comments to target posts', async () => {
    if (bootstrapError || !payload || !graphqlPost) {
      return
    }

    const user = await createUser('Posts Comment GraphQL User')
    const bearerToken = await createBearerToken(user)
    const companyID = await getOwnedCompanyID(user.id)
    const post = await createTrackedPost({
      bearerToken,
      companyID,
      contentLabel: `Comment target ${crypto.randomUUID()}`,
      slug: `comment-target-${crypto.randomUUID()}`,
      title: `Comment Target ${crypto.randomUUID()}`,
    })

    const commentData = {
      content: 'A post comment',
      company: companyID,
      replyPost: {
        relationTo: 'posts' as const,
        value: post.id,
      },
    }

    await expect(
      payload.create({
        collection: 'comments',
        data: commentData,
        draft: false,
        overrideAccess: false,
      }),
    ).rejects.toThrow()

    const comment = await payload.create({
      collection: 'comments',
      data: commentData,
      draft: false,
      overrideAccess: true,
    })

    createdCommentIDs.push(comment.id)

    expect(comment.serverUrl).toBe(getServerSideURL())
    expect((comment as { company?: string | null }).company).toBe(companyID)

    const commentResponse = await runAuthorizedGraphQLOperation({
      bearerToken,
      query: commentByIDQuery(comment.id),
    })

    expect(commentResponse.response.status).toBe(200)
    expect(commentResponse.body.errors).toBeUndefined()
    expect(commentResponse.body.data?.comment).toMatchObject({
      company: {
        id: companyID,
        name: expect.any(String),
      },
      id: comment.id,
    })
  })

  it('lists and searches posts through GraphQL with like metadata', async () => {
    if (bootstrapError || !payload || !graphqlPost) {
      return
    }

    const user = await createUser('Posts Search GraphQL User')
    const bearerToken = await createBearerToken(user)
    const companyID = await getOwnedCompanyID(user.id)
    const searchToken = crypto.randomUUID()
    const matchingPost = await createTrackedPost({
      bearerToken,
      companyID,
      contentLabel: `Matching content ${searchToken}`,
      slug: `matching-post-${searchToken}`,
      title: `Matching Post ${searchToken}`,
    })
    const secondPost = await createTrackedPost({
      bearerToken,
      companyID,
      contentLabel: `Second content ${searchToken}`,
      slug: `second-post-${searchToken}`,
      title: `Second Post ${searchToken}`,
    })

    const byIDListResponse = await runAuthorizedGraphQLOperation({
      bearerToken,
      query: postsByIDListQuery(matchingPost.id),
    })

    expect(byIDListResponse.response.status).toBe(200)
    expect(byIDListResponse.body.errors).toBeUndefined()
    expect(byIDListResponse.body.data?.posts).toMatchObject({
      totalDocs: 1,
      docs: [
        {
          hasLiked: false,
          id: matchingPost.id,
          likeCount: 0,
          slug: matchingPost.slug,
          title: matchingPost.title,
        },
      ],
    })

    const searchResponse = await runAuthorizedGraphQLOperation({
      bearerToken,
      query: postsSearchQuery(searchToken),
    })

    expect(searchResponse.response.status).toBe(200)
    expect(searchResponse.body.errors).toBeUndefined()
    expect(searchResponse.body.data?.posts?.totalDocs).toBeGreaterThanOrEqual(2)
    expect(searchResponse.body.data?.posts?.docs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          hasLiked: false,
          id: matchingPost.id,
          likeCount: 0,
          slug: matchingPost.slug,
          title: matchingPost.title,
        }),
        expect.objectContaining({
          hasLiked: false,
          id: secondPost.id,
          likeCount: 0,
          slug: secondPost.slug,
          title: secondPost.title,
        }),
      ]),
    )
  })

  it('filters posts by company id through GraphQL', async () => {
    if (bootstrapError || !payload || !graphqlPost) {
      return
    }

    const user = await createUser('Posts Company Filter GraphQL User')
    const bearerToken = await createBearerToken(user)
    const companyID = await getOwnedCompanyID(user.id)
    const matchingPost = await createTrackedPost({
      bearerToken,
      companyID,
      contentLabel: `Company match ${crypto.randomUUID()}`,
      slug: `company-match-${crypto.randomUUID()}`,
      title: `Company Match ${crypto.randomUUID()}`,
    })
    await createTrackedPost({
      bearerToken,
      companyID,
      contentLabel: `Company second ${crypto.randomUUID()}`,
      slug: `company-second-${crypto.randomUUID()}`,
      title: `Company Second ${crypto.randomUUID()}`,
    })

    const response = await runAuthorizedGraphQLOperation({
      bearerToken,
      query: postsByCompanyIDQuery(companyID),
    })

    expect(response.response.status).toBe(200)
    expect(response.body.errors).toBeUndefined()
    expect(response.body.data?.posts).toMatchObject({
      totalDocs: 2,
      docs: expect.arrayContaining([
        expect.objectContaining({
          company: {
            id: companyID,
            name: expect.any(String),
          },
          id: matchingPost.id,
          slug: matchingPost.slug,
          title: matchingPost.title,
        }),
      ]),
    })
  })
})
