import BigNumber from 'bignumber.js'
import type { Payload } from 'payload'
import type { VerifyTransactionResult } from '@/crypto/types'
import { getOrderCheckoutGroup } from './utils'
import type { Order } from '@/payload-types'

/** A browser-supplied hash alone never qualifies: it must match a private, verified session for this order. */
export const verifyOrderCheckoutGroup = async (
  payload: Payload,
  order: Order,
  group: {
    chain: string
    recipientAddress: string
    transactionHash: string
    productIDs: string[]
    expectedStableAmount: BigNumber
  },
): Promise<VerifyTransactionResult | null> => {
  if (group.chain !== 'ethereum') {
    return null
  }
  const sessions = await payload.find({
    collection: 'checkout-sessions',
    where: {
      and: [
        { order: { equals: order.id } },
        { kind: { equals: 'order' } },
        { status: { equals: 'paid' } },
        { destinationTransactionHash: { equals: group.transactionHash.toLowerCase() } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const session = sessions.docs[0]
  if (!session) {
    return null
  }
  const expected = getOrderCheckoutGroup(order, group.recipientAddress)
  const matches =
    session.receiver.toLowerCase() === group.recipientAddress.toLowerCase() &&
    session.orderPaymentKey === expected.paymentKey &&
    session.amountUsdCents === expected.amountUsdCents &&
    group.expectedStableAmount.times(100).eq(session.amountUsdCents) &&
    expected.targets.length === group.productIDs.length &&
    expected.targets.every((target) => group.productIDs.includes(target.productID))
  return {
    chain: 'ethereum',
    provider: 'thirdweb',
    ok: matches,
    productIDs: group.productIDs,
    recipientAddress: group.recipientAddress,
    transactionHash: group.transactionHash,
    ...(matches
      ? {}
      : { error: 'The Thirdweb receipt does not cover this exact order payment group.' }),
  }
}
