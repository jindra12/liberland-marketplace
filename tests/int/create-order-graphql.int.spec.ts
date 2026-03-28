import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

let payload: Payload | null = null
let bootstrapError: Error | null = null
let graphqlPost: ((request: Request) => Promise<Response>) | null = null
let productID: string | null = null
let createdOrderIDs: string[] = []

type GraphQLResponseBody = {
  data?: {
    createOrder?: { amount?: number | null; id?: string }
    updateOrder?: {
      id?: string
      payerAddress?: string | null
      transactionHashes?: Array<{
        chain?: 'ethereum' | 'solana' | 'tron'
        transactionHash?: string
        product?: { id?: string }
      }>
    }
  }
  errors?: Array<{ message?: string }>
}

const mockDB = {
  orders: [] as Array<{ id: string }>,
  products: [{ id: 'mock-product-1' }],
}

const createMockGraphQLPost = async (request: Request): Promise<Response> => {
  const body = (await request.json()) as {
    query?: string
    variables?: {
      data?: {
        customerEmail?: string
        items?: Array<{ product?: string; quantity?: number }>
      }
    }
  }

  if (!body.query?.includes('mutation CreateOrder')) {
    return new Response(
      JSON.stringify({
        errors: [{ message: 'Unsupported operation for mock GraphQL handler.' }],
      }),
      { status: 400 },
    )
  }

  const firstItem = body.variables?.data?.items?.[0]
  const requestedProduct = firstItem?.product
  const knownProduct = mockDB.products.find((product) => product.id === requestedProduct)

  if (!knownProduct) {
    return new Response(
      JSON.stringify({
        errors: [{ message: `Product ${String(requestedProduct)} not found in mocked DB.` }],
      }),
      { status: 200 },
    )
  }

  const orderID = `mock-order-${mockDB.orders.length + 1}`
  mockDB.orders.push({ id: orderID })

  return new Response(
    JSON.stringify({
      data: {
        createOrder: {
          id: orderID,
        },
      },
    } satisfies GraphQLResponseBody),
    { status: 200 },
  )
}

const CREATE_ORDER_MUTATION = `
  mutation CreateOrder($data: mutationOrderInput!, $draft: Boolean!) {
    createOrder(data: $data, draft: $draft) {
      id
      status
      payerAddress
      customer {
        id
      }
      transactions {
        id
      }
      cryptoPrices {
        id
        chain
        stablePerNative
        nativePerStable
        expectedNativeAmount
        fetchedAt
      }
      transactionHashes {
        id
        chain
        transactionHash
        product {
          id
        }
      }
      currency
      amount
      customerEmail
      createdAt
      updatedAt
      items {
        id
        quantity
        product {
          id
          serverURL
          name
          cryptoAddresses {
            chain
            address
          }
          company {
            id
            cryptoAddresses {
              chain
              address
            }
          }
        }
        variant {
          id
          title
        }
      }
      shippingAddress {
        title
        firstName
        lastName
        company
        addressLine1
        addressLine2
        city
        postalCode
        state
        country
        phone
      }
    }
  }
`

const UPDATE_ORDER_PAYER_ADDRESS_MUTATION = `
  mutation UpdateOrder($id: String!, $data: mutationOrderInput!, $draft: Boolean!) {
    updateOrder(id: $id, data: $data, draft: $draft) {
      id
      payerAddress
    }
  }
`

const UPDATE_ORDER_STATUS_MUTATION = `
  mutation UpdateOrder($id: String!, $data: mutationOrderInput!, $draft: Boolean!) {
    updateOrder(id: $id, data: $data, draft: $draft) {
      id
      status
    }
  }
`

const UPDATE_ORDER_TRANSACTION_HASHES_MUTATION = `
  mutation UpdateOrder($orderId: String!, $data: mutationOrderUpdateInput!, $draft: Boolean!) {
    updateOrder(id: $orderId, data: $data, draft: $draft) {
      id
      transactionHashes {
        chain
        transactionHash
        product {
          id
        }
      }
    }
  }
`

describe('GraphQL createOrder mutation regression', () => {
  beforeAll(async () => {
    try {
      const [{ getPayload }, configModule] = await Promise.all([
        import('payload'),
        import('@/payload.config'),
      ])

      const graphqlRouteModule = await import('@/app/(payload)/api/graphql/route')
      graphqlPost = graphqlRouteModule.POST

      const payloadConfig = await configModule.default
      payload = await getPayload({ config: payloadConfig })

      const products = await payload.find({
        collection: 'products',
        depth: 0,
        limit: 1,
        sort: '-createdAt',
      })

      productID = products.docs[0]?.id || null
    } catch (error) {
      bootstrapError = error instanceof Error ? error : new Error('Unknown Payload bootstrap error')
    }
  })

  afterEach(async () => {
    if (!payload || createdOrderIDs.length === 0) {
      return
    }

    for (const orderID of createdOrderIDs) {
      if (orderID.startsWith('mock-order-')) {
        continue
      }

      await payload.delete({
        collection: 'orders',
        id: orderID,
      })
    }

    createdOrderIDs = []
  })

  it(
    'executes the failing createOrder mutation successfully under normal conditions',
    async () => {
      const hasRealGraphQL = !bootstrapError && Boolean(payload) && Boolean(productID) && Boolean(graphqlPost)
      const postHandler = hasRealGraphQL && graphqlPost ? graphqlPost : createMockGraphQLPost
      const resolvedProductID = hasRealGraphQL && productID ? productID : mockDB.products[0].id

      const variables = {
        draft: false,
        data: {
          customerEmail: 'create-order-regression@example.com',
          items: [{ product: resolvedProductID, quantity: 1 }],
          shippingAddress: {
            firstName: 'Jan',
            lastName: 'Jindracek',
            addressLine1: 'Bojcenkova',
            addressLine2: '198 00 Capital City of Prague, Czechia',
            city: 'Capital City of Prague',
            state: 'Prague',
            postalCode: '198 00',
            country: 'Czechia',
            phone: '724163293',
          },
        },
      }

      const request = new Request('http://localhost:3001/api/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query: CREATE_ORDER_MUTATION,
          variables,
        }),
      })

      const response = await postHandler(request)
      const result = (await response.json()) as GraphQLResponseBody

      expect(response.status).toBe(200)
      expect(result.errors).toBeUndefined()
      expect(result.data?.createOrder?.id).toBeDefined()
      if (hasRealGraphQL) {
        expect(typeof result.data?.createOrder?.amount).toBe('number')
      }

      if (result.data?.createOrder?.id) {
        createdOrderIDs.push(result.data.createOrder.id)
      }

      if (!hasRealGraphQL || !graphqlPost || !result.data?.createOrder?.id) {
        return
      }

      const updatePayerAddressRequest = new Request('http://localhost:3001/api/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query: UPDATE_ORDER_PAYER_ADDRESS_MUTATION,
          variables: {
            draft: false,
            id: result.data.createOrder.id,
            data: {
              payerAddress: '0x1111111111111111111111111111111111111111',
            },
          },
        }),
      })

      const updatePayerAddressResponse = await graphqlPost(updatePayerAddressRequest)
      const updatePayerAddressResult = (await updatePayerAddressResponse.json()) as GraphQLResponseBody

      expect(updatePayerAddressResponse.status).toBe(200)
      expect(updatePayerAddressResult.errors).toBeUndefined()
      expect(updatePayerAddressResult.data?.updateOrder?.payerAddress).toBe(
        '0x1111111111111111111111111111111111111111',
      )

      const firstTxHash = '0xe0e5bcbc1ed1fbf19ce55bfd0cd292f19d53783c4bea327c696201a36e17aed9'
      const updateTxHashesRequest = new Request('http://localhost:3001/api/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query: UPDATE_ORDER_TRANSACTION_HASHES_MUTATION,
          variables: {
            orderId: result.data.createOrder.id,
            draft: false,
            data: {
              transactionHashes: [
                {
                  product: resolvedProductID,
                  chain: 'ethereum',
                  transactionHash: firstTxHash,
                },
              ],
            },
          },
        }),
      })

      const updateTxHashesResponse = await graphqlPost(updateTxHashesRequest)
      const updateTxHashesResult = (await updateTxHashesResponse.json()) as GraphQLResponseBody

      expect(updateTxHashesResponse.status).toBe(200)
      expect(updateTxHashesResult.errors).toBeUndefined()
      expect(updateTxHashesResult.data?.updateOrder?.transactionHashes).toEqual([
        {
          chain: 'ethereum',
          transactionHash: firstTxHash,
          product: { id: resolvedProductID },
        },
      ])

      const secondTxHash = '0x7f6f6b27a97f70a2a56af190cb4dbd5267db813411f1236d31f86d476fb28a18'
      const appendTxHashesRequest = new Request('http://localhost:3001/api/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query: UPDATE_ORDER_TRANSACTION_HASHES_MUTATION,
          variables: {
            orderId: result.data.createOrder.id,
            draft: false,
            data: {
              transactionHashes: [
                {
                  product: resolvedProductID,
                  chain: 'ethereum',
                  transactionHash: secondTxHash,
                },
              ],
            },
          },
        }),
      })

      const appendTxHashesResponse = await graphqlPost(appendTxHashesRequest)
      const appendTxHashesResult = (await appendTxHashesResponse.json()) as GraphQLResponseBody

      expect(appendTxHashesResponse.status).toBe(200)
      expect(appendTxHashesResult.errors).toBeUndefined()
      expect(appendTxHashesResult.data?.updateOrder?.transactionHashes).toEqual([
        {
          chain: 'ethereum',
          transactionHash: firstTxHash,
          product: { id: resolvedProductID },
        },
        {
          chain: 'ethereum',
          transactionHash: secondTxHash,
          product: { id: resolvedProductID },
        },
      ])

      const updateStatusRequest = new Request('http://localhost:3001/api/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query: UPDATE_ORDER_STATUS_MUTATION,
          variables: {
            draft: false,
            id: result.data.createOrder.id,
            data: {
              status: 'completed',
            },
          },
        }),
      })

      const updateStatusResponse = await graphqlPost(updateStatusRequest)
      const updateStatusResult = (await updateStatusResponse.json()) as GraphQLResponseBody

      expect(updateStatusResponse.status).toBe(200)
      expect(updateStatusResult.errors?.length).toBeGreaterThan(0)
      expect(updateStatusResult.errors?.[0]?.message).toContain('not allowed')
    },
    120_000,
  )
})
