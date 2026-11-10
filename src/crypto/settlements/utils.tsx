import { APIError, ValidationError, type PayloadRequest } from 'payload'
import type { Order } from '@/payload-types'
import { toStringID } from '@/utilities/toStringID'
import { normalizeTransactionHash } from '../utils'

/** Invoke only after on-chain verification. Claims survive interruption for same-order retry. */
export const recordPaymentSettlements = async (
  req: PayloadRequest,
  orderID: string,
  proofs: NonNullable<Order['paymentProofs']>,
) => {
  const keys = Array.from(
    new Set(
      proofs.map(
        (proof) => `${proof.chain}:${normalizeTransactionHash(proof.chain, proof.transactionHash)}`,
      ),
    ),
  )
  await keys.reduce(async (previous, key) => {
    await previous
    const existing = await req.payload.find({
      collection: 'payment-settlements',
      where: { key: { equals: key } },
      limit: 1,
      pagination: false,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (existing.docs[0]) {
      if (toStringID(existing.docs[0].order) !== orderID) {
        throw new APIError('This payment has already settled another order.', 409)
      }
      return
    }
    try {
      await req.payload.create({
        collection: 'payment-settlements',
        data: { key, order: orderID },
        overrideAccess: true,
        req,
      })
    } catch (error) {
      if (
        error instanceof ValidationError &&
        error.data.errors.some((entry) => entry.path === 'key')
      ) {
        const claimed = await req.payload.find({
          collection: 'payment-settlements',
          where: { key: { equals: key } },
          limit: 1,
          pagination: false,
          depth: 0,
          overrideAccess: true,
          req,
        })
        if (claimed.docs[0] && toStringID(claimed.docs[0].order) === orderID) {
          return
        }
        throw new APIError(
          'This payment was settled by a concurrent request. Reload the order before retrying.',
          409,
        )
      }
      throw error
    }
  }, Promise.resolve())
}
