import { APIError, type PayloadRequest } from 'payload'
import { Types } from 'mongoose'
import { z } from 'zod'
import type { Order } from '@/payload-types'
import type { PaymentProofRow } from '@/fields/orderFields'
import { TEXT_INPUT_MAX_LENGTH } from '@/fields/constants'
import { toStringID } from '@/utilities/toStringID'
import { normalizeTransactionHash } from '../utils'
import { resolveProductIDsForItems } from '../recipient'

const proofKey = (row: PaymentProofRow) =>
  `${toStringID(row.product)}:${row.chain}:${row.chain && row.transactionHash ? normalizeTransactionHash(row.chain, row.transactionHash) : ''}`

export const mergeCustomerPaymentProofs = async (
  order: Order,
  incoming: PaymentProofRow[],
  req: PayloadRequest,
) => {
  const existing = order.paymentProofs || []
  const products = order.paymentTargets?.length
    ? order.paymentTargets.map((target) => target.productID)
    : await resolveProductIDsForItems({ items: order.items, payload: req.payload, req })
  const keys = new Set(existing.map(proofKey))
  const additions = incoming.reduce<NonNullable<Order['paymentProofs']>>((rows, row) => {
    const product = toStringID(row.product)
    if (!product || !products.includes(product)) {
      throw new APIError('A payment proof must refer to a product in this order.', 400)
    }
    const chain = z.enum(['ethereum', 'solana', 'tron']).parse(row.chain)
    const transactionHash = normalizeTransactionHash(
      chain,
      z.string().min(1).max(TEXT_INPUT_MAX_LENGTH).parse(row.transactionHash),
    )
    const key = proofKey({ product, chain, transactionHash })
    if (keys.has(key)) {
      return rows
    }
    keys.add(key)
    return [
      ...rows,
      {
        id: new Types.ObjectId().toHexString(),
        product,
        chain,
        transactionHash,
        fulfilled: false,
        rejected: false,
      },
    ]
  }, [])
  if (additions.length && order.status !== 'processing') {
    throw new APIError('Only processing orders can accept new payment proofs.', 409)
  }
  return additions.length ? [...existing, ...additions] : null
}
