import lodash from 'lodash'
import type { SupportedChain } from './types'
import { getPayloadInstance } from './payload'

type HasHashBeenUsedInput = {
  chain: SupportedChain
  orderId?: string
  transactionHash: string
}

export const hasHashBeenUsed = async ({
  chain,
  orderId,
  transactionHash,
}: HasHashBeenUsedInput): Promise<boolean> => {
  const payload = await getPayloadInstance()
  // Match chain and hash in the same proof row. An unverified claim is not a reservation.
  // Use the Mongoose model so configured identifier types are cast by the adapter.
  const existing = await payload.db.collections.orders.exists({
    ...(orderId ? { _id: { $ne: orderId } } : {}),
    status: 'completed',
    paymentProofs: {
      $elemMatch: {
        chain,
        transactionHash: chain === 'solana'
          ? transactionHash
          : new RegExp(`^${lodash.escapeRegExp(transactionHash)}$`, 'i'),
      },
    },
  })

  return Boolean(existing)
}
