import type { Order } from '@/payload-types'
import { getPayloadInstance } from './payload'
import type { OrderCryptoPrice, SupportedChain } from './types'

export type OrderTransactionHashEntry = {
  chain: SupportedChain
  productID: string
  transactionHash: string
}

export type OrderCryptoPriceEntry = OrderCryptoPrice

const toDocID = (value: unknown): string =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? String((value as { id: unknown }).id)
    : String(value)

export const getOrderById = async (orderId: string): Promise<Order> => {
  const payload = await getPayloadInstance()

  return payload.findByID({
    collection: 'orders',
    id: orderId,
    depth: 0,
  })
}

export const getOrderTransactionHashEntries = (order: Order): OrderTransactionHashEntry[] => {
  if (!Array.isArray(order.transactionHashes)) {
    return []
  }

  return order.transactionHashes.map((entry) => ({
    chain: (entry as { chain: SupportedChain }).chain,
    productID: toDocID((entry as { product: unknown }).product),
    transactionHash: String((entry as { transactionHash: unknown }).transactionHash),
  }))
}

export const getOrderCryptoPriceEntries = (order: Order): OrderCryptoPriceEntry[] => {
  if (!Array.isArray(order.cryptoPrices)) {
    return []
  }

  return order.cryptoPrices as OrderCryptoPriceEntry[]
}

export const getOrderCreatedAtMs = (order: Order): number => {
  return new Date(order.createdAt).getTime()
}
