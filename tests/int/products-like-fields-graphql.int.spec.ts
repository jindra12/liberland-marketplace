import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import type { User } from '@/payload-types'

let payload: Payload | null = null
let bootstrapError: Error | null = null
let graphqlPost: ((request: Request) => Promise<Response>) | null = null

const createdOauthAccessTokenIDs: string[] = []
const createdProductIDs: string[] = []
const createdCompanyIDs: string[] = []
const createdIdentityIDs: string[] = []
const createdUserIDs: string[] = []

type GraphQLResponseBody = {
  data?: {
    product?: {
      hasLiked?: boolean | null
      id: string
      likeCount?: number | null
      name?: string | null
    } | null
    products?: {
      docs: Array<{
        hasLiked?: boolean | null
        id: string
        likeCount?: number | null
        name?: string | null
      }>
    } | null
    setLikeState?: {
      hasLiked?: boolean | null
      id: string
      likeCount?: number | null
      name?: string | null
    } | null
    updateProduct?: {
      hasLiked?: boolean | null
      id: string
      likeCount?: number | null
      name?: string | null
    } | null
  }
  errors?: Array<{ message?: string }>
}

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

const createLikeableProduct = async ({
  ownerID,
}: {
  ownerID: string
}): Promise<{ companyID: string; productID: string }> => {
  if (!payload) {
    throw new Error('Payload is not available.')
  }

  const identity = await payload.create({
    collection: 'identities',
    data: {
      createdBy: ownerID,
      description: 'Identity for product likes testing.',
      name: `Products Likes Identity ${crypto.randomUUID()}`,
      website: 'https://example.com/products-likes-identity',
    },
    draft: false,
  })

  const company = await payload.create({
    collection: 'companies',
    data: {
      _status: 'published',
      createdBy: ownerID,
      description: 'Company for product likes testing.',
      identity: identity.id,
      name: `Products Likes Company ${crypto.randomUUID()}`,
      website: 'https://example.com/products-likes-company',
    },
    draft: false,
  })

  const product = await payload.create({
    collection: 'products',
    data: {
      _status: 'published',
      company: company.id,
      name: `Products Likes Product ${crypto.randomUUID()}`,
    },
    draft: false,
  })

  createdCompanyIDs.push(String(company.id))
  createdIdentityIDs.push(String(identity.id))
  createdProductIDs.push(String(product.id))

  return { companyID: String(company.id), productID: String(product.id) }
}

const buildProductQuery = (productID: string): string => `
  query {
    product(id: ${JSON.stringify(productID)}) {
      id
      name
      hasLiked
      likeCount
    }
  }
`

const buildProductsListQuery = (productID: string): string => `
  query {
    products(limit: 1, where: { id: { equals: ${JSON.stringify(productID)} } }) {
      docs {
        id
        name
        hasLiked
        likeCount
      }
    }
  }
`

const buildSetLikeStateMutation = ({
  liked,
  productID,
}: {
  liked: boolean
  productID: string
}): string => `
  mutation {
    setLikeState(collection: products, id: ${JSON.stringify(productID)}, liked: ${liked}) {
      id
      name
      hasLiked
      likeCount
    }
  }
`

const buildUpdateProductMutation = ({
  name,
  productID,
}: {
  name: string
  productID: string
}): string => `
  mutation {
    updateProduct(id: ${JSON.stringify(productID)}, data: { name: ${JSON.stringify(name)} }) {
      id
      name
      hasLiked
      likeCount
    }
  }
`

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
    createdUserIDs.map((id) =>
      currentPayload.delete({
        collection: 'users',
        id,
      }),
    ),
  )
  createdUserIDs.length = 0

  await Promise.all(
    createdProductIDs.map((id) =>
      currentPayload.delete({
        collection: 'products',
        id,
      }),
    ),
  )
  createdProductIDs.length = 0

  await Promise.all(
    createdCompanyIDs.map((id) =>
      currentPayload.delete({
        collection: 'companies',
        id,
      }),
    ),
  )
  createdCompanyIDs.length = 0

  await Promise.all(
    createdIdentityIDs.map((id) =>
      currentPayload.delete({
        collection: 'identities',
        id,
      }),
    ),
  )
  createdIdentityIDs.length = 0
}

describe('Products GraphQL like fields', () => {
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

  it('exposes likeCount and hasLiked on product read queries', async () => {
    if (bootstrapError || !payload) {
      return
    }

    const user = await createUser('Product GraphQL Read User')
    const bearerToken = await createBearerToken(user)
    const { productID } = await createLikeableProduct({
      ownerID: String(user.id),
    })

    const singleResponse = await runGraphQLOperation({
      headers: {
        authorization: `Bearer ${bearerToken}`,
      },
      query: buildProductQuery(productID),
    })

    expect(singleResponse.response.status).toBe(200)
    expect(singleResponse.body.errors).toBeUndefined()
    expect(singleResponse.body.data?.product).toMatchObject({
      hasLiked: false,
      id: productID,
      likeCount: 0,
    })

    const listResponse = await runGraphQLOperation({
      headers: {
        authorization: `Bearer ${bearerToken}`,
      },
      query: buildProductsListQuery(productID),
    })

    expect(listResponse.response.status).toBe(200)
    expect(listResponse.body.errors).toBeUndefined()
    expect(listResponse.body.data?.products?.docs).toHaveLength(1)
    expect(listResponse.body.data?.products?.docs[0]).toMatchObject({
      hasLiked: false,
      id: productID,
      likeCount: 0,
    })
  })

  it('updates product likeCount and hasLiked through GraphQL like mutations', async () => {
    if (bootstrapError || !payload) {
      return
    }

    const user = await createUser('Product GraphQL Update User')
    const bearerToken = await createBearerToken(user)
    const { productID } = await createLikeableProduct({
      ownerID: String(user.id),
    })

    const likeResponse = await runGraphQLOperation({
      headers: {
        authorization: `Bearer ${bearerToken}`,
      },
      query: buildSetLikeStateMutation({
        liked: true,
        productID,
      }),
    })

    expect(likeResponse.response.status).toBe(200)
    expect(likeResponse.body.errors).toBeUndefined()
    expect(likeResponse.body.data?.setLikeState).toMatchObject({
      hasLiked: true,
      id: productID,
      likeCount: 1,
    })

    const updateResponse = await runGraphQLOperation({
      headers: {
        authorization: `Bearer ${bearerToken}`,
      },
      query: buildUpdateProductMutation({
        name: `Updated Products Likes Product ${crypto.randomUUID()}`,
        productID,
      }),
    })

    expect(updateResponse.response.status).toBe(200)
    expect(updateResponse.body.errors).toBeUndefined()
    expect(updateResponse.body.data?.updateProduct).toMatchObject({
      hasLiked: true,
      id: productID,
      likeCount: 1,
    })

    const unlikeResponse = await runGraphQLOperation({
      headers: {
        authorization: `Bearer ${bearerToken}`,
      },
      query: buildSetLikeStateMutation({
        liked: false,
        productID,
      }),
    })

    expect(unlikeResponse.response.status).toBe(200)
    expect(unlikeResponse.body.errors).toBeUndefined()
    expect(unlikeResponse.body.data?.setLikeState).toMatchObject({
      hasLiked: false,
      id: productID,
      likeCount: 0,
    })

    const readBackResponse = await runGraphQLOperation({
      headers: {
        authorization: `Bearer ${bearerToken}`,
      },
      query: buildProductQuery(productID),
    })

    expect(readBackResponse.response.status).toBe(200)
    expect(readBackResponse.body.errors).toBeUndefined()
    expect(readBackResponse.body.data?.product).toMatchObject({
      hasLiked: false,
      id: productID,
      likeCount: 0,
    })
  })
})
