import { getPayloadInstance } from './payload'
import type { ProductPaymentTarget } from './recipient'
import type { OrderCryptoPrice, SupportedChain } from './types'
import type { PaymentProofRow } from '@/fields/orderFields'
import type { Order } from '@/payload-types'

export type OrderPaymentProofEntry = {
  chain: SupportedChain
  productID: string
  transactionHash: string
}

export type OrderWithPaymentProofs = Order & {
  paymentProofs?: PaymentProofRow[] | null
  paymentTargets?: ProductPaymentTarget[] | null
}

export type OrderCryptoPriceEntry = OrderCryptoPrice

const toDocID = (value: unknown): string =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? String((value as { id: unknown }).id)
    : String(value)

export const getOrderById = async (orderId: string): Promise<OrderWithPaymentProofs> => {
  const payload = await getPayloadInstance()

  return (await payload.findByID({
    collection: 'orders',
    id: orderId,
    depth: 0,
  })) as unknown as OrderWithPaymentProofs
}

export const getOrderPaymentProofEntries = (
  order: OrderWithPaymentProofs,
): OrderPaymentProofEntry[] => {
  if (!Array.isArray(order.paymentProofs)) {
    return []
  }

  return order.paymentProofs.map((entry) => ({
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

export const getOrderPaymentTargetEntries = (
  order: OrderWithPaymentProofs,
): ProductPaymentTarget[] => {
  if (!Array.isArray(order.paymentTargets)) {
    return []
  }

  return order.paymentTargets
    .filter((entry): entry is ProductPaymentTarget => Boolean(entry && typeof entry === 'object'))
    .map((entry) => ({
      chain: entry.chain,
      normalizedRecipientAddress: String(entry.normalizedRecipientAddress ?? ''),
      productID: String(entry.productID ?? ''),
      quantity: Number(entry.quantity ?? 0),
      recipientAddress: String(entry.recipientAddress ?? ''),
      stableAmount: Number(entry.stableAmount ?? 0),
      unitAmount: Number(entry.unitAmount ?? 0),
    }))
}

export const getOrderCreatedAtMs = (order: Order): number => {
  return new Date(order.createdAt).getTime()
}
