import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import type { User } from '@/payload-types'

let payload: Payload | null = null
let bootstrapError: Error | null = null
let graphqlPost: ((request: Request) => Promise<Response>) | null = null

const createdCompanyIDs: string[] = []
const createdIdentityIDs: string[] = []
const createdOauthAccessTokenIDs: string[] = []
const createdUserIDs: string[] = []

type GraphQLResponseBody = {
  data?: {
    shareRepost?: {
      company?: {
        id: string
        name?: string | null
      } | null
      post?: {
        content?: string | null
        id: string
        meta?: {
          description?: string | null
        } | null
        repost?: string | null
        title?: string | null
      } | null
      source?: {
        description?: string
        imageURL?: string | null
        isSinglePageApp?: boolean
        link?: string
        title?: string
      } | null
    } | null
  }
  errors?: Array<{ message?: string }>
}

const createUser = async (label: string): Promise<User> => {
  if (!payload) {
    throw new Error('Payload is not available.')
  }

  const user = (await payload.create({
    collection: 'users',
    data: {
      email: `${label}-${crypto.randomUUID()}@example.com`,
      emailVerified: true,
      name: label,
    },
  })) as User

  createdUserIDs.push(String(user.id))

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

  createdOauthAccessTokenIDs.push(String(tokenRecord.id))

  return accessToken
}

const createOwnedCompany = async (user: User): Promise<string> => {
  if (!payload) {
    throw new Error('Payload is not available.')
  }

  const identity = (await payload.create({
    collection: 'identities',
    data: {
      createdBy: user.id,
      name: `Share Identity ${crypto.randomUUID()}`,
    },
    draft: false,
  })) as { id: string | number }
  createdIdentityIDs.push(String(identity.id))
  const identityId = String(identity.id)

  const company = (await payload.create({
    collection: 'companies',
    data: {
      _status: 'published',
      createdBy: user.id,
      identity: identityId,
      name: `Share Company ${crypto.randomUUID()}`,
      noAutoPost: false,
    },
    draft: false,
  })) as { id: string | number }
  createdCompanyIDs.push(String(company.id))

  return String(company.id)
}

const runAuthorizedGraphQLOperation = async ({
  bearerToken,
  query,
  variables,
}: {
  bearerToken: string
  query: string
  variables?: Record<string, unknown>
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
    body: JSON.stringify({ query, variables }),
  })

  const response = await graphqlPost(request)
  const body = (await response.json()) as GraphQLResponseBody

  return { body, response }
}

describe('share GraphQL mutation', () => {
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
    if (!payload) {
      return
    }

    for (const id of createdOauthAccessTokenIDs.reverse()) {
      await payload.delete({
        collection: 'oauthAccessTokens',
        id,
      })
    }

    createdOauthAccessTokenIDs.length = 0

    for (const id of createdCompanyIDs.reverse()) {
      await payload.delete({
        collection: 'companies',
        id,
      })
    }

    createdCompanyIDs.length = 0

    for (const id of createdIdentityIDs.reverse()) {
      await payload.delete({
        collection: 'identities',
        id,
      })
    }

    createdIdentityIDs.length = 0

    for (const id of createdUserIDs.reverse()) {
      await payload.delete({
        collection: 'users',
        id,
      })
    }

    createdUserIDs.length = 0
  })

  it('creates a repost through GraphQL with a description override', async () => {
    if (bootstrapError || !payload || !graphqlPost) {
      return
    }

    const user = await createUser('Share GraphQL User')
    const companyID = await createOwnedCompany(user)
    const bearerToken = await createBearerToken(user)
    const pageURL = 'https://source.example.com/articles/hello-world'
    const imageURL = 'https://source.example.com/assets/hero.jpg'
    const overriddenDescription = 'Manual GraphQL share description'

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL) => {
        const resolvedURL = typeof input === 'string' ? input : input.toString()

        if (resolvedURL === pageURL) {
          return new Response(
            `
            <html>
              <head>
                <title>Head title</title>
                <meta name="description" content="Head description">
                <meta property="og:image" content="${imageURL}">
              </head>
              <body>
                <h1>Fallback title</h1>
                <p>Fallback paragraph.</p>
              </body>
            </html>
          `,
            {
              headers: {
                'content-type': 'text/html; charset=utf-8',
              },
            },
          )
        }

        if (resolvedURL === imageURL) {
          return new Response(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), {
            headers: {
              'content-type': 'image/jpeg',
            },
          })
        }

        throw new Error(`Unexpected fetch URL: ${resolvedURL}`)
      })

    let response: Response | null = null

    try {
      const mutation = `
        mutation ShareRepost($input: ShareRepostInput!) {
          shareRepost(input: $input) {
            company {
              id
              name
            }
            post {
              id
              content
              meta {
                description
              }
              repost
              title
            }
            source {
              description
              imageURL
              isSinglePageApp
              link
              title
            }
          }
        }
      `

      const result = await runAuthorizedGraphQLOperation({
        bearerToken,
        query: mutation,
        variables: {
          input: {
            companyId: companyID,
            description: overriddenDescription,
            link: pageURL,
          },
        },
      })
      response = result.response

      expect(result.body.errors).toBeUndefined()
      expect(result.body.data?.shareRepost).toMatchObject({
        company: {
          id: companyID,
        },
        post: {
          content: expect.stringContaining(overriddenDescription),
          meta: {
            description: overriddenDescription,
          },
          repost: pageURL,
        },
        source: {
          description: overriddenDescription,
          imageURL,
          isSinglePageApp: false,
          link: pageURL,
          title: 'Head title',
        },
      })
    } finally {
      fetchSpy.mockRestore()
    }

    if (!response) {
      throw new Error('Share GraphQL mutation did not return a response.')
    }

    expect(response.status).toBe(200)
  })
})
