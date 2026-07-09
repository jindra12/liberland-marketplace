import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import type { Product } from '@/payload-types'
import { toStringID } from '@/utilities/toStringID'

let payload: Payload | null = null
let bootstrapError: Error | null = null
let graphqlPost: ((request: Request) => Promise<Response>) | null = null
let productID: string | null = null
let originalProductParameters: Product['parameters'] | null = null
let createdCartIDs: string[] = []
let createdOrderIDs: string[] = []

type GraphQLResponseBody = {
  data?: {
    createCart?: {
      id?: string
      items?: Array<{
        parameters?: Array<{
          name?: string | null
          values?: Array<{
            key?: string | null
            name?: string | null
            selected?: boolean | null
          }>
        }>
      }>
    }
    updateCart?: {
      id?: string
      items?: Array<{
        parameters?: Array<{
          name?: string | null
          values?: Array<{
            key?: string | null
            name?: string | null
            selected?: boolean | null
          }>
        }>
      }>
    }
    createOrder?: {
      id?: string
      items?: Array<{
        parameters?: Array<{
          name?: string | null
          values?: Array<{
            key?: string | null
            name?: string | null
            selected?: boolean | null
          }>
        }>
      }>
    }
  }
  errors?: Array<{ message?: string }>
}

const VALID_PARAMETERS = [
  {
    name: 'Size',
    values: [
      { key: 'S', name: 'Small', default: false, selected: false },
      { key: 'M', name: 'Medium', default: true, selected: true },
    ],
  },
  {
    name: 'Color',
    values: [
      { key: 'RED', name: 'Red', default: true, selected: true },
      { key: 'BLUE', name: 'Blue', default: false, selected: false },
    ],
  },
]

const SPOOFED_PARAMETERS = [
  {
    name: 'Size',
    values: [
      { key: 'S', name: 'Small', default: false, selected: false },
      { key: 'XL', name: 'Extra large', default: true, selected: true },
    ],
  },
  {
    name: 'Color',
    values: [
      { key: 'RED', name: 'Red', default: true, selected: true },
      { key: 'BLUE', name: 'Blue', default: false, selected: false },
    ],
  },
]

const CREATE_CART_MUTATION = `
  mutation CreateCart($data: mutationCartInput!, $draft: Boolean!) {
    createCart(data: $data, draft: $draft) {
      id
      items {
        id
        parameters {
          name
          values {
            key
            name
            selected
          }
        }
      }
    }
  }
`

const UPDATE_CART_MUTATION = `
  mutation UpdateCart($id: String!, $data: mutationCartUpdateInput!, $draft: Boolean!) {
    updateCart(id: $id, data: $data, draft: $draft) {
      id
      items {
        id
        parameters {
          name
          values {
            key
            name
            selected
          }
        }
      }
    }
  }
`

const CREATE_ORDER_MUTATION = `
  mutation CreateOrder($data: mutationOrderInput!, $draft: Boolean!) {
    createOrder(data: $data, draft: $draft) {
      id
      items {
        id
        parameters {
          name
          values {
            key
            name
            selected
          }
        }
      }
    }
  }
`

const FRONTEND_CREATE_ORDER_MUTATION = `
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
        currency
        amount
        customerEmail
        createdAt
        updatedAt
        items {
            id
            quantity
            parameters {
                id
                name
                values {
                    id
                    key
                    name
                    selected
                }
            }
            product {
                id
                serverURL
                name
                priceInETH
                priceInSOL
                priceInTRX
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

const FRONTEND_UPDATE_ORDER_MUTATION = `
mutation UpdateOrder($orderId: String!, $data: mutationOrderUpdateInput!, $draft: Boolean!) {
    updateOrder(id: $orderId, data: $data, draft: $draft) {
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
        currency
        amount
        customerEmail
        createdAt
        updatedAt
        items {
            id
            quantity
            parameters {
                id
                name
                values {
                    id
                    key
                    name
                    selected
                }
            }
            product {
                id
                serverURL
                name
                priceInETH
                priceInSOL
                priceInTRX
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

const postGraphQL = async ({
  query,
  variables,
}: {
  query: string
  variables: Record<string, unknown>
}): Promise<GraphQLResponseBody> => {
  if (!graphqlPost) {
    throw new Error('GraphQL route is not available.')
  }

  const response = await graphqlPost(
    new Request('http://localhost:3001/api/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    }),
  )

  return (await response.json()) as GraphQLResponseBody
}

describe('Cart and order parameter selection', () => {
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

      const product = products.docs[0] as Product | undefined
      productID = product ? toStringID(product) : null
      originalProductParameters = product?.parameters ?? null

      if (!payload || !productID) {
        throw new Error('Unable to load a product for parameter tests.')
      }

      await payload.update({
        collection: 'products',
        data: {
          parameters: VALID_PARAMETERS,
        },
        id: productID,
      })
    } catch (error) {
      bootstrapError = error instanceof Error ? error : new Error('Unknown parameter bootstrap error')
    }
  })

  afterEach(async () => {
    if (!payload) {
      return
    }

    await Promise.all(
      createdCartIDs.map(async (id) => {
        await payload?.delete({
          collection: 'carts',
          id,
        })
      }),
    )

    await Promise.all(
      createdOrderIDs.map(async (id) => {
        await payload?.delete({
          collection: 'orders',
          id,
        })
      }),
    )

    createdCartIDs = []
    createdOrderIDs = []
  })

  afterAll(async () => {
    if (!payload || !productID) {
      return
    }

    await payload.update({
      collection: 'products',
      data: {
        parameters: originalProductParameters,
      },
      id: productID,
    })
  })

  it('accepts parameter selections when creating and updating a cart, and when creating an order', async () => {
    if (bootstrapError || !payload || !productID || !graphqlPost) {
      return
    }

    const createCartResult = await postGraphQL({
      query: CREATE_CART_MUTATION,
      variables: {
        data: {
          items: [
            {
              parameters: VALID_PARAMETERS,
              product: productID,
              quantity: 1,
            },
          ],
        },
        draft: false,
      },
    })

    expect(createCartResult.errors).toBeUndefined()
    expect(createCartResult.data?.createCart?.id).toBeDefined()
    expect(createCartResult.data?.createCart?.items?.[0]?.parameters?.[0]?.values?.find((value) => value.selected))
      .toMatchObject({
        key: 'M',
        name: 'Medium',
        selected: true,
      })

    const cartID = createCartResult.data?.createCart?.id
    if (cartID) {
      createdCartIDs.push(cartID)
    }

    const updateCartResult = cartID
      ? await postGraphQL({
          query: UPDATE_CART_MUTATION,
          variables: {
            data: {
              items: [
                {
                  parameters: [
                    {
                      name: 'Size',
                      values: [
                        { key: 'S', name: 'Small', selected: true },
                        { key: 'M', name: 'Medium', selected: false },
                      ],
                    },
                    {
                      name: 'Color',
                      values: [
                        { key: 'RED', name: 'Red', selected: false },
                        { key: 'BLUE', name: 'Blue', selected: true },
                      ],
                    },
                  ],
                  product: productID,
                  quantity: 1,
                },
              ],
            },
            draft: false,
            id: cartID,
          },
        })
      : null

    expect(updateCartResult?.errors).toBeUndefined()
    expect(updateCartResult?.data?.updateCart?.items?.[0]?.parameters?.[0]?.values?.find((value) => value.selected))
      .toMatchObject({
        key: 'S',
        name: 'Small',
        selected: true,
      })

    const createOrderResult = await postGraphQL({
      query: FRONTEND_CREATE_ORDER_MUTATION,
      variables: {
        data: {
          customerEmail: 'parameter-flow@example.com',
          items: [
            {
              parameters: VALID_PARAMETERS,
              product: productID,
              quantity: 1,
            },
          ],
          shippingAddress: {
            addressLine1: 'Bojcenkova',
            addressLine2: '198 00 Capital City of Prague, Czechia',
            city: 'Capital City of Prague',
            country: 'Czechia',
            firstName: 'Jan',
            lastName: 'Jindracek',
            phone: '724163293',
            postalCode: '198 00',
            state: 'Prague',
            title: 'Home',
          },
        },
        draft: false,
      },
    })

    expect(createOrderResult.errors).toBeUndefined()
    expect(createOrderResult.data?.createOrder?.id).toBeDefined()
    expect(createOrderResult.data?.createOrder?.items?.[0]?.parameters?.[1]?.values?.find((value) => value.selected))
      .toMatchObject({
        key: 'RED',
        name: 'Red',
        selected: true,
      })

    const orderID = createOrderResult.data?.createOrder?.id
    if (orderID) {
      createdOrderIDs.push(orderID)
    }

    const updateOrderResult = orderID
      ? await postGraphQL({
          query: FRONTEND_UPDATE_ORDER_MUTATION,
          variables: {
            data: {
              payerAddress: '0x1111111111111111111111111111111111111111',
            },
            draft: false,
            orderId: orderID,
          },
        })
      : null

    expect(updateOrderResult?.errors).toBeUndefined()
    expect(updateOrderResult?.data?.updateOrder?.payerAddress).toBe(
      '0x1111111111111111111111111111111111111111',
    )
  }, 120_000)

  it('rejects spoofed parameter values on carts and orders', async () => {
    if (bootstrapError || !payload || !productID || !graphqlPost) {
      return
    }

    const invalidCartResult = await postGraphQL({
      query: CREATE_CART_MUTATION,
      variables: {
        data: {
          items: [
            {
              parameters: SPOOFED_PARAMETERS,
              product: productID,
              quantity: 1,
            },
          ],
        },
        draft: false,
      },
    })

    expect(invalidCartResult.errors?.[0]?.message).toContain('invalid value')

    const invalidOrderResult = await postGraphQL({
      query: CREATE_ORDER_MUTATION,
      variables: {
        data: {
          customerEmail: 'parameter-spoof@example.com',
          items: [
            {
              parameters: SPOOFED_PARAMETERS,
              product: productID,
              quantity: 1,
            },
          ],
          shippingAddress: {
            addressLine1: 'Bojcenkova',
            addressLine2: '198 00 Capital City of Prague, Czechia',
            city: 'Capital City of Prague',
            country: 'Czechia',
            firstName: 'Jan',
            lastName: 'Jindracek',
            phone: '724163293',
            postalCode: '198 00',
            state: 'Prague',
            title: 'Home',
          },
        },
        draft: false,
      },
    })

    expect(invalidOrderResult.errors?.[0]?.message).toContain('invalid value')
  }, 120_000)
})
