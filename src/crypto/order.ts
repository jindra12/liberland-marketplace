import type { Order } from '@/payload-types'
import { getPayloadInstance } from './payload'
import type { OrderCryptoPrice, SupportedChain } from './types'

export type OrderTransactionHashEntry = {
  chain: SupportedChain
  productID: string
  transactionHash: string
}

export type OrderCryptoPriceEntry = OrderCryptoPrice

const isSupportedChain = (chain: unknown): chain is SupportedChain =>
  chain === 'ethereum' || chain === 'solana' || chain === 'tron'

const toDocID = (value: unknown): string | null => {
  if (typeof value === 'string' || typeof value === 'number') {
    const id = String(value).trim()
    return id.length > 0 ? id : null
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return toDocID((value as { id?: unknown }).id)
  }

  return null
}

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

  return order.transactionHashes
    .map((entry) => {
      if (!entry) {
        return null
      }

      const productID = toDocID((entry as { product?: unknown }).product)
      if (!productID || !isSupportedChain(entry.chain) || typeof entry.transactionHash !== 'string') {
        return null
      }

      return {
        chain: entry.chain,
        productID,
        transactionHash: entry.transactionHash.trim(),
      }
    })
    .filter((entry): entry is OrderTransactionHashEntry => Boolean(entry && entry.transactionHash.length > 0))
}

export const getOrderCryptoPriceEntries = (order: Order): OrderCryptoPriceEntry[] => {
  if (!Array.isArray(order.cryptoPrices)) {
    return []
  }

  return order.cryptoPrices.filter(
    (entry): entry is OrderCryptoPriceEntry =>
      Boolean(
        entry &&
        isSupportedChain(entry.chain) &&
        typeof entry.fetchedAt === 'string' &&
        typeof entry.nativePerStable === 'string' &&
        entry.nativePerStable.trim().length > 0 &&
        typeof entry.stablePerNative === 'number',
      ),
  )
}

export const getOrderCreatedAtMs = (order: Order): number => {
  const createdAtMs = new Date(order.createdAt).getTime()
  if (!Number.isFinite(createdAtMs)) {
    throw new Error(`Order ${order.id} has invalid createdAt timestamp.`)
  }
  return createdAtMs
}
