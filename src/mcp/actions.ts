import { executeGraphQL } from './graphql'
import type { McpJsonObject } from './types'

const USER_FIELDS = 'id name email phone shippingAddress { title firstName lastName company addressLine1 addressLine2 city state postalCode country phone } wallets { chain provider address }'
const SELLER_ORDER_PRODUCT_FIELDS = 'id chain fulfilled rejected orderCreatedAt orderId orderStatus customerEmail payerAddress paymentProofId productId quantity transactionHash paymentProof { chain fulfilled rejected id transactionHash } product { id name updatedAt createdAt company { id name } createdBy { id } } shippingAddress { title firstName lastName company addressLine1 addressLine2 city state postalCode country phone }'
const ORDER_PAYMENT_FIELDS = 'id status amount currency payerAddress cryptoPrices { chain expectedNativeAmount } paymentTargets { chain productID quantity recipientAddress normalizedRecipientAddress stableAmount unitAmount } paymentProofs { id chain transactionHash fulfilled rejected }'

type UserCapabilitiesResponse = {
  meUser?: {
    user?: {
      id?: string | null
      shippingAddress?: ShippingAddress | null
      wallets?: Array<{ chain: string; provider: string; address: string }> | null
    } | null
  } | null
}

type SellerOrderProductsResponse = {
  sellerOrderProducts: {
    totalDocs: number
    totalPages: number
    page: number
    limit: number
    hasPrevPage: boolean
    hasNextPage: boolean
    docs: McpJsonObject[]
  }
}

type SellerOrderProductMutationResponse = {
  updateSellerOrderProductFulfilled: McpJsonObject
}

type SellerOrderProductRejectedMutationResponse = {
  updateSellerOrderProductRejected: McpJsonObject
}

type ShippingAddress = Record<string, string | null | undefined>

type OrderPaymentTarget = {
  chain: string
  productID: string
  quantity: number
  recipientAddress: string
  normalizedRecipientAddress: string
  stableAmount: number
  unitAmount: number
}

type OrderPaymentPrice = {
  chain: string
  expectedNativeAmount?: string | null
}

type OrderPaymentResponse = {
  Order: {
    id: string
    status?: string | null
    amount?: number | null
    currency?: string | null
    payerAddress?: string | null
    cryptoPrices?: OrderPaymentPrice[] | null
    paymentTargets?: OrderPaymentTarget[] | null
  } | null
}

export const getWalletCapabilities = async (authorization?: string) => {
  const data = await executeGraphQL<UserCapabilitiesResponse>({ authorization, query: `query McpMeUser { meUser { user { ${USER_FIELDS} } } }` })
  return data.meUser?.user
}

export const saveShippingAddress = async (authorization: string | undefined, address: McpJsonObject) => {
  const user = await getWalletCapabilities(authorization)
  if (!user?.id) throw new Error('Authenticated user not found.')
  const data = await executeGraphQL({ authorization, query: `mutation UpdateShippingAddress($id: String!, $data: mutationUserUpdateInput!) { updateUser(id: $id, data: $data) { ${USER_FIELDS} } }`, variables: { id: user.id, data: { shippingAddress: address } } })
  return data.updateUser
}

export const listShippingAddresses = async (authorization: string | undefined) => {
  const user = await getWalletCapabilities(authorization)
  return { addresses: user?.shippingAddress ? [user.shippingAddress] : [] }
}

export const updateShippingAddress = saveShippingAddress

export const deleteShippingAddress = async (authorization: string | undefined) => saveShippingAddress(authorization, {})

export const preparePayment = async (authorization: string | undefined, orderId: string) => {
  const orderResult = await executeGraphQL<OrderPaymentResponse>({
    authorization,
    query: `query PreparePayment($id: String!) { Order(id: $id) { ${ORDER_PAYMENT_FIELDS} } }`,
    variables: { id: orderId },
  })
  const order = orderResult.Order
  if (!order) throw new Error('Order not found.')

  const pricesByChain = new Map((order.cryptoPrices ?? []).map((price) => [price.chain, price.expectedNativeAmount ?? null]))
  const payments = (order.paymentTargets ?? []).map((target) => ({
    chain: target.chain,
    recipientAddress: target.normalizedRecipientAddress || target.recipientAddress,
    productId: target.productID,
    quantity: target.quantity,
    stableAmount: target.stableAmount,
    unitStableAmount: target.unitAmount,
    nativeAmount: pricesByChain.get(target.chain) ?? null,
  }))
  const wallets = await getWalletCapabilities(authorization)
  const requiredChains = Array.from(new Set(payments.map((payment) => payment.chain)))
  return {
    orderId: order.id,
    status: order.status ?? null,
    currency: order.currency ?? null,
    totalStableAmount: order.amount ?? null,
    payerAddress: order.payerAddress ?? null,
    payments,
    walletRequirements: requiredChains.map((chain) => ({
      chain,
      availableWallets: (wallets?.wallets ?? []).filter((wallet) => wallet.chain === chain),
    })),
  }
}

export const createPost = async (authorization: string | undefined, data: McpJsonObject) => {
  const result = await executeGraphQL({ authorization, query: 'mutation CreatePost($data: MutationPostInput!) { createPost(data: $data) { id title slug content publishedAt createdAt } }', variables: { data } })
  return result.createPost
}

export const updatePost = async (authorization: string | undefined, id: string, data: McpJsonObject) => {
  const result = await executeGraphQL({ authorization, query: 'mutation UpdatePost($id: String!, $data: MutationPostUpdateInput!) { updatePost(id: $id, data: $data) { id title slug content publishedAt updatedAt } }', variables: { id, data } })
  return result.updatePost
}

export const createReply = async (authorization: string | undefined, data: McpJsonObject) => {
  const result = await executeGraphQL({ authorization, query: 'mutation CreateReply($data: MutationCommentInput!) { createComment(data: $data) { id content replyCount createdAt replyComment { id } createdBy { id name } } }', variables: { data } })
  return result.createComment
}

export const updateComment = async (authorization: string | undefined, id: string, content: string) => {
  const result = await executeGraphQL({ authorization, query: 'mutation UpdateComment($id: String!, $data: MutationCommentUpdateInput!) { updateComment(id: $id, data: $data) { id content updatedAt } }', variables: { id, data: { content } } })
  return result.updateComment
}

export const deleteComment = async (authorization: string | undefined, id: string) => {
  const result = await executeGraphQL({ authorization, query: 'mutation DeleteComment($id: String!) { deleteComment(id: $id) { id } }', variables: { id } })
  return result.deleteComment
}

export const unsubscribe = async (authorization: string | undefined, id: string) => {
  const result = await executeGraphQL({ authorization, query: 'mutation DeleteSubscription($id: String!) { deleteNotificationSubscription(id: $id) { id } }', variables: { id } })
  return result.deleteNotificationSubscription
}

export const listSellerOrders = async (authorization: string | undefined, filters: { fulfilled?: boolean; rejected?: boolean; limit?: number; page?: number }) => {
  const result = await executeGraphQL<SellerOrderProductsResponse>({
    authorization,
    query: `query SellerOrderProducts($fulfilled: Boolean, $rejected: Boolean, $limit: Int, $page: Int) { sellerOrderProducts(fulfilled: $fulfilled, rejected: $rejected, limit: $limit, page: $page) { totalDocs totalPages page limit hasPrevPage hasNextPage docs { ${SELLER_ORDER_PRODUCT_FIELDS} } } }`,
    variables: filters,
  })
  return result.sellerOrderProducts
}

export const updateSellerOrderProductFulfilled = async (authorization: string | undefined, input: { fulfilled: boolean; orderId: string; paymentProofId: string }) => {
  const result = await executeGraphQL<SellerOrderProductMutationResponse>({
    authorization,
    query: `mutation UpdateSellerOrderProductFulfilled($fulfilled: Boolean!, $orderId: String!, $paymentProofId: String!) { updateSellerOrderProductFulfilled(fulfilled: $fulfilled, orderId: $orderId, paymentProofId: $paymentProofId) { ${SELLER_ORDER_PRODUCT_FIELDS} } }`,
    variables: input,
  })
  return result.updateSellerOrderProductFulfilled
}

export const updateSellerOrderProductRejected = async (authorization: string | undefined, input: { rejected: boolean; orderId: string; paymentProofId: string }) => {
  const result = await executeGraphQL<SellerOrderProductRejectedMutationResponse>({
    authorization,
    query: `mutation UpdateSellerOrderProductRejected($rejected: Boolean!, $orderId: String!, $paymentProofId: String!) { updateSellerOrderProductRejected(rejected: $rejected, orderId: $orderId, paymentProofId: $paymentProofId) { ${SELLER_ORDER_PRODUCT_FIELDS} } }`,
    variables: input,
  })
  return result.updateSellerOrderProductRejected
}
