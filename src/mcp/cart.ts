import { getServerSideURL } from '@/utilities/getURL'
import { executeGraphQL } from './graphql'
import type { McpJsonObject } from './types'

export const CART_FIELDS = 'id secret status currency subtotal createdAt updatedAt purchasedAt items { id quantity parameters { id name values { id key name selected } } product { id serverURL name description orderable inventory priceInUSD priceInETH priceInSOL priceInTRX cryptoAddresses { chain address } } variant { id title inventory } }'

type CartItem = { id?: string | null; quantity?: number | null; product?: { id?: string | null } | null; variant?: { id?: string | null } | null; parameters?: McpJsonObject[] | null }
type Cart = { id: string; items?: CartItem[] | null; [key: string]: unknown }
type CartQueryData = { Carts?: { docs?: Cart[] | null } | null }

const getCart = async (authorization: string | undefined, secret: string): Promise<Cart> => {
  const data = await executeGraphQL<CartQueryData>({ authorization, query: `query CartBySecret($secret: String!) { Carts(limit: 1, where: { secret: { equals: $secret } }) { docs { ${CART_FIELDS} } } }`, variables: { secret } })
  const cart = data.Carts?.docs?.[0]
  if (!cart) throw new Error('Cart not found.')
  return cart
}

const toUpdateItem = (item: CartItem): McpJsonObject => ({
  ...(item.id ? { id: item.id } : {}),
  ...(item.product?.id ? { product: item.product.id } : {}),
  ...(item.variant?.id ? { variant: item.variant.id } : {}),
  quantity: item.quantity ?? 0,
  ...(item.parameters ? { parameters: item.parameters } : {}),
})

const updateCart = async (authorization: string | undefined, cart: Cart, items: McpJsonObject[]) => {
  const data = await executeGraphQL({ authorization, query: `mutation UpdateCart($id: String!, $data: mutationCartUpdateInput!, $draft: Boolean!) { updateCart(id: $id, data: $data, draft: $draft) { ${CART_FIELDS} } }`, variables: { id: cart.id, data: { items }, draft: false } })
  return { serverUrl: getServerSideURL(), cart: data.updateCart }
}

export const getCartForMcp = async (authorization: string | undefined, secret: string) => ({ serverUrl: getServerSideURL(), cart: await getCart(authorization, secret) })

export const addCartItemForMcp = async (authorization: string | undefined, args: { secret?: string; product: string; variant?: string; quantity: number; parameters?: McpJsonObject[] }) => {
  if (!args.secret) {
    const data = await executeGraphQL({ authorization, query: `mutation CreateCart($data: mutationCartInput!, $draft: Boolean!) { createCart(data: $data, draft: $draft) { ${CART_FIELDS} } }`, variables: { data: { items: [{ product: args.product, ...(args.variant ? { variant: args.variant } : {}), quantity: args.quantity, ...(args.parameters ? { parameters: args.parameters } : {}) }] }, draft: false } })
    return { serverUrl: getServerSideURL(), cart: data.createCart }
  }

  const cart = await getCart(authorization, args.secret)
  const items = (cart.items ?? []).map(toUpdateItem)
  const existing = items.find((item) => item.product === args.product && item.variant === args.variant)
  if (existing) {
    existing.quantity = Number(existing.quantity) + args.quantity
    if (args.parameters) existing.parameters = args.parameters
  } else {
    items.push({ product: args.product, ...(args.variant ? { variant: args.variant } : {}), quantity: args.quantity, ...(args.parameters ? { parameters: args.parameters } : {}) })
  }
  return updateCart(authorization, cart, items)
}

export const setCartItemQuantityForMcp = async (authorization: string | undefined, secret: string, itemId: string, quantity: number) => {
  const cart = await getCart(authorization, secret)
  return updateCart(authorization, cart, (cart.items ?? []).map(toUpdateItem).map((item) => item.id === itemId ? { ...item, quantity } : item))
}

export const removeCartItemForMcp = async (authorization: string | undefined, secret: string, itemId: string) => {
  const cart = await getCart(authorization, secret)
  return updateCart(authorization, cart, (cart.items ?? []).filter((item) => item.id !== itemId).map(toUpdateItem))
}

export const clearCartForMcp = async (authorization: string | undefined, secret: string) => {
  const cart = await getCart(authorization, secret)
  return updateCart(authorization, cart, [])
}
