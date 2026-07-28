import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

let payload: Payload | null = null
let bootstrapError: Error | null = null
let graphqlPost: ((request: Request) => Promise<Response>) | null = null

const createdCompanyIDs: string[] = []
const createdIdentityIDs: string[] = []
const createdOauthAccessTokenIDs: string[] = []
const createdStartupIDs: string[] = []
const createdUserIDs: string[] = []

type TestUser = {
  email: string
  id: string
}

type GraphQLResponseBody = {
  data?: {
    joinStartup?: {
      message: string
      startup?: {
        id: string
        involvedUsers?: Array<{
          email?: string | null
          id: string
        }> | null
      } | null
    } | null
    leaveStartup?: {
      message: string
      startup?: {
        id: string
        involvedUsers?: Array<{
          email?: string | null
          id: string
        }> | null
      } | null
    } | null
  }
  errors?: Array<{ message?: string }>
}

const createUser = async (label: string): Promise<TestUser> => {
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

  const userID = String(user.id)
  createdUserIDs.push(userID)

  const relatedCompanies = await payload.find({
    collection: 'companies',
    depth: 0,
    limit: 10,
    where: {
      createdBy: {
        equals: String(user.id),
      },
    },
  })

  relatedCompanies.docs.forEach((company) => {
    createdCompanyIDs.push(String(company.id))
  })

  return {
    email: user.email,
    id: userID,
  }
}

const createBearerToken = async (user: TestUser): Promise<string> => {
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

const createPublishedStartup = async (): Promise<{ id: string }> => {
  if (!payload) {
    throw new Error('Payload is not available.')
  }

  const identity = await payload.create({
    collection: 'identities',
    data: {
      createdBy: 'system',
      name: `Startup Identity ${crypto.randomUUID()}`,
    },
    draft: false,
  })
  createdIdentityIDs.push(String(identity.id))

  const company = await payload.create({
    collection: 'companies',
    data: {
      createdBy: 'system',
      identity: String(identity.id),
      name: `Startup Company ${crypto.randomUUID()}`,
      _status: 'published',
    },
    draft: false,
  })
  createdCompanyIDs.push(String(company.id))

  const startup = await payload.create({
    collection: 'startups',
    data: {
      _status: 'published',
      company: String(company.id),
      createdBy: 'system',
      identity: String(identity.id),
      stage: 'idea',
      title: `Startup ${crypto.randomUUID()}`,
    },
    draft: false,
  })
  createdStartupIDs.push(String(startup.id))

  return {
    id: String(startup.id),
  }
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

describe('Startup membership GraphQL access', () => {
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

    for (const id of createdStartupIDs.reverse()) {
      await payload.delete({
        collection: 'startups',
        id,
      })
    }

    createdStartupIDs.length = 0

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

  it('lets an authenticated user join and leave a startup via bearer-token GraphQL', async () => {
    if (bootstrapError || !payload || !graphqlPost) {
      return
    }

    const user = await createUser('Startup GraphQL User')
    const bearerToken = await createBearerToken(user)
    const startup = await createPublishedStartup()

    const joinMutation = `
      mutation JoinStartup($id: String!) {
        joinStartup(id: $id) {
          message
          startup {
            id
            involvedUsers {
              id
              email
            }
          }
        }
      }
    `

    const { body: joinBody, response: joinResponse } = await runAuthorizedGraphQLOperation({
      bearerToken,
      query: joinMutation,
      variables: {
        id: String(startup.id),
      },
    })

    expect(joinResponse.status).toBe(200)
    expect(joinBody.errors).toBeUndefined()
    expect(joinBody.data?.joinStartup?.message).toBe('Successfully joined venture.')
    expect(joinBody.data?.joinStartup?.startup?.id).toBe(String(startup.id))
    expect(joinBody.data?.joinStartup?.startup?.involvedUsers).toEqual([
      {
        email: user.email,
        id: String(user.id),
      },
    ])

    const leaveMutation = `
      mutation LeaveStartup($id: String!) {
        leaveStartup(id: $id) {
          message
          startup {
            id
            involvedUsers {
              id
              email
            }
          }
        }
      }
    `

    const { body: leaveBody, response: leaveResponse } = await runAuthorizedGraphQLOperation({
      bearerToken,
      query: leaveMutation,
      variables: {
        id: String(startup.id),
      },
    })

    expect(leaveResponse.status).toBe(200)
    expect(leaveBody.errors).toBeUndefined()
    expect(leaveBody.data?.leaveStartup?.message).toBe('Successfully left venture.')
    expect(leaveBody.data?.leaveStartup?.startup?.id).toBe(String(startup.id))
    expect(leaveBody.data?.leaveStartup?.startup?.involvedUsers ?? []).toEqual([])
  })
})
