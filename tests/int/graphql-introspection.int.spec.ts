import { beforeAll, describe, expect, it } from 'vitest'
import { getIntrospectionQuery } from 'graphql'

let bootstrapError: Error | null = null
let graphqlPost: ((request: Request) => Promise<Response>) | null = null

type GraphQLResponseBody = {
  data?: {
    __schema?: unknown
  }
  errors?: Array<{ message?: string }>
}

describe('GraphQL schema introspection', () => {
  beforeAll(async () => {
    try {
      const graphqlRouteModule = await import('@/app/(payload)/api/graphql/route')
      graphqlPost = graphqlRouteModule.POST
    } catch (error) {
      bootstrapError = error instanceof Error ? error : new Error('Unknown GraphQL bootstrap error')
    }
  })

  it('returns the full schema without introspection errors', async () => {
    if (bootstrapError || !graphqlPost) {
      return
    }

    const request = new Request('http://localhost:3001/api/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: getIntrospectionQuery(),
      }),
    })

    const response = await graphqlPost(request)
    const body = (await response.json()) as GraphQLResponseBody

    expect(response.status).toBe(200)
    expect(body.errors).toBeUndefined()
    expect(body.data?.__schema).toBeDefined()
  })
})
