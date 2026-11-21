import { GRAPHQL_POST } from '@payloadcms/next/routes'
import { ObjectId } from 'mongodb'
import { createLocalReq } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { createMongoSecurityFixture, registerMongoOAuthGrant } from './mongo/utils'

vi.mock('@/utilities/sendAuthEmail', () => ({ sendAuthEmail: vi.fn() }))
vi.mock('next/cache', async (original) => ({
  ...(await original<typeof import('next/cache')>()),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))
vi.mock('@payloadcms/email-nodemailer', () => ({
  nodemailerAdapter: async () => () => ({
    name: 'isolated-email',
    defaultFromAddress: 'fixture@example.test',
    defaultFromName: 'Fixture',
    sendEmail: vi.fn(),
  }),
}))

const payload = await createMongoSecurityFixture()
await registerMongoOAuthGrant(payload)
const post = GRAPHQL_POST(Promise.resolve(payload.config))
const productId = new ObjectId()
await payload.db.collections.products.collection.insertOne({
  _id: productId,
  name: 'Cart capability fixture',
  _status: 'published',
  orderable: true,
  priceInUSDEnabled: true,
  priceInUSD: 123,
  inventory: 10,
})

type CartResult = {
  id: string
  secret?: string | null
  subtotal: number
  items: Array<{ quantity: number }>
}
type Result = {
  errors?: Array<{ message: string }>
  data?: {
    createCart?: CartResult
    updateCart?: CartResult
    deleteCart?: { id: string }
    Carts?: { docs: CartResult[] }
  }
}
const request = async (query: string, variables: object, secret = '', authorization = '') => {
  const response = await post(
    new Request('https://backend.example/api/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(secret ? { 'x-cart-secret': secret } : {}),
        ...(authorization ? { authorization } : {}),
      },
      body: JSON.stringify({ query, variables }),
    }),
  )
  return response.json() as Promise<Result>
}
const selection = 'id secret subtotal items { quantity }'
const createCart = async (authorization = '') => {
  const result = await request(
    `mutation CreateCart($data: mutationCartInput!, $draft: Boolean!) {
      createCart(data: $data, draft: $draft) { ${selection} }
    }`,
    { data: { items: [{ product: productId.toHexString(), quantity: 1 }] }, draft: false },
    '',
    authorization,
  )
  expect(result.errors).toBeUndefined()
  expect(result.data?.createCart?.secret).toBeTruthy()
  return result.data!.createCart!
}
const readCart = (filterSecret: string, headerSecret = '', authorization = '') =>
  request(
    `query CartBySecret($secret: String!) {
    Carts(where: { secret: { equals: $secret } }) { docs { ${selection} } }
  }`,
    { secret: filterSecret },
    headerSecret,
    authorization,
  )
const updateCart = (id: string, secret: string, quantity: number, authorization = '') =>
  request(
    `mutation UpdateCart($id: String!, $data: mutationCartUpdateInput!, $draft: Boolean!) {
    updateCart(id: $id, data: $data, draft: $draft) { ${selection} }
  }`,
    {
      id,
      data: { items: quantity ? [{ product: productId.toHexString(), quantity }] : [] },
      draft: false,
    },
    secret,
    authorization,
  )
const deleteCart = (id: string, secret: string) =>
  request('mutation DeleteCart($id: String!) { deleteCart(id: $id) { id } }', { id }, secret)

describe('Secret-authorized GraphQL cart lifecycle', () => {
  it.each(['guest', 'signed-in'])('reads, updates, clears and deletes a %s cart', async (mode) => {
    const grant = mode === 'signed-in' ? await registerMongoOAuthGrant(payload) : null
    const authorization = grant ? `Bearer ${grant.accessToken}` : ''
    if (grant) {
      expect(
        (await payload.findByID({ collection: 'users', id: grant.userId })).role,
      ).not.toContain('admin')
    }
    const { OPTIONS } = await import('@/app/(payload)/api/graphql/route')
    const preflight = await OPTIONS()
    expect(preflight.headers.get('access-control-allow-headers')?.toLowerCase()).toContain(
      'x-cart-secret',
    )
    const cart = await createCart(authorization)
    const read = await readCart(cart.secret!, cart.secret!, authorization)
    expect(read.errors).toBeUndefined()
    expect(read.data?.Carts?.docs).toMatchObject([{ id: cart.id, subtotal: 123 }])
    expect(read.data?.Carts?.docs[0]?.secret).toBeNull()
    const updated = await updateCart(cart.id, cart.secret!, 2, authorization)
    expect(updated.errors).toBeUndefined()
    expect(updated.data?.updateCart).toMatchObject({ subtotal: 246, items: [{ quantity: 2 }] })
    const cleared = await updateCart(cart.id, cart.secret!, 0, authorization)
    expect(cleared.errors).toBeUndefined()
    expect(cleared.data?.updateCart).toMatchObject({ subtotal: 0, items: [] })
    expect((await deleteCart(cart.id, cart.secret!)).data?.deleteCart?.id).toBe(cart.id)
  })

  it.each(['', 'incorrect-secret'])(
    'rejects read, update and delete with capability "%s"',
    async (secret) => {
      const cart = await createCart()
      const read = await readCart(cart.secret!, secret)
      expect(read.data?.Carts?.docs || []).toHaveLength(0)
      expect((await updateCart(cart.id, secret, 5)).errors?.length).toBeGreaterThan(0)
      expect((await deleteCart(cart.id, secret)).errors?.length).toBeGreaterThan(0)
      expect((await payload.findByID({ collection: 'carts', id: cart.id })).subtotal).toBe(123)
    },
  )

  it('never authorizes another cart with a valid secret for the first cart', async () => {
    const owned = await createCart()
    const other = await createCart()
    const read = await readCart(other.secret!, owned.secret!)
    expect(read.data?.Carts?.docs || []).toHaveLength(0)
    expect((await updateCart(other.id, owned.secret!, 5)).errors?.length).toBeGreaterThan(0)
    expect((await deleteCart(other.id, owned.secret!)).errors?.length).toBeGreaterThan(0)
    expect((await payload.findByID({ collection: 'carts', id: other.id })).subtotal).toBe(123)
  })

  it('keeps the MCP cart lifecycle on the same secret-authorized GraphQL path', async () => {
    const { getCartForMcp, setCartItemQuantityForMcp, clearCartForMcp } = await import('@/mcp/cart')
    const cart = await createCart()
    const found = await getCartForMcp(undefined, cart.secret!)
    expect(found.cart.id).toBe(cart.id)
    const itemId = found.cart.items![0]!.id!
    expect(await setCartItemQuantityForMcp(undefined, cart.secret!, itemId, 2)).toMatchObject({
      cart: { subtotal: 246, items: [{ quantity: 2 }] },
    })
    expect(await clearCartForMcp(undefined, cart.secret!)).toMatchObject({
      cart: { subtotal: 0, items: [] },
    })
    await expect(getCartForMcp(undefined, 'incorrect-secret')).rejects.toThrow('Cart not found')
  })

  it('scopes cart access to one verified account-tool request without retaining its capability', async () => {
    const { getCartForMcp } = await import('@/mcp/cart')
    const { withMcpAccountRequest } = await import('@/mcp/graphql')
    const grant = await registerMongoOAuthGrant(payload)
    const authenticated = await payload.auth({
      headers: new Headers({ authorization: `Bearer ${grant.accessToken}` }),
    })
    expect(authenticated.user).toMatchObject({ id: grant.userId })
    const req = await createLocalReq({ user: authenticated.user! }, payload)
    const cart = await createCart()
    const found = await withMcpAccountRequest(req, () => getCartForMcp(undefined, cart.secret!))
    expect(found.cart.id).toBe(cart.id)
    expect(req.context.cartSecret).toBeUndefined()
    expect(req.headers.get('x-cart-secret')).toBeNull()
    await expect(
      withMcpAccountRequest(req, () => getCartForMcp(undefined, 'wrong-secret')),
    ).rejects.toThrow('Cart not found')
  })
})
