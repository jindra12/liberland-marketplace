import { randomUUID } from 'node:crypto'
import { APIError, ValidationError, createLocalReq, type PayloadRequest } from 'payload'
import { isAddress } from 'thirdweb/utils'
import type { CheckoutSession } from '@/payload-types'
import { toStringID } from '@/utilities/toStringID'
import { updateAtomically } from '@/utilities/atomicUpdates/utils'
import { mergeCustomerPaymentProofs } from '@/crypto/proofs/utils'
import { CHECKOUT_SETTLEMENT } from '../constants'
import {
  getOrderCheckoutGroup,
  getThirdwebOrderRecipients,
  isThirdwebOrderCheckoutEnabled,
} from './utils'

const requireOrderCustomer = async (req: PayloadRequest, orderId: string) => {
  if (!req.user) {
    throw new APIError('Sign in to pay for your order.', 401)
  }
  const order = await req.payload.findByID({
    collection: 'orders',
    id: orderId,
    depth: 0,
    overrideAccess: false,
    req,
  })
  if (toStringID(order.customer) !== String(req.user.id)) {
    throw new APIError('Only the customer can start or verify this order payment.', 403)
  }
  return order
}

/** Retries and simultaneous clicks reuse a durable session for this exact backend/order/recipient. */
export const createOrderCheckoutSession = async (
  req: PayloadRequest,
  orderId: string,
  recipient: string,
) => {
  const order = await requireOrderCustomer(req, orderId)
  if (!(await isThirdwebOrderCheckoutEnabled(req))) {
    throw new APIError(
      'This marketplace has not enabled Thirdweb checkout after webhook setup.',
      503,
    )
  }
  if (order.status !== 'processing' || !isAddress(recipient)) {
    throw new APIError(
      'Thirdweb checkout requires a processing order and valid Ethereum recipient.',
      409,
    )
  }
  const group = getOrderCheckoutGroup(order, recipient)
  const find = async () =>
    (
      await req.payload.find({
        collection: 'checkout-sessions',
        where: { orderPaymentKey: { equals: group.paymentKey } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req,
      })
    ).docs[0]
  const existing = await find()
  // A previously paid session must remain recoverable even if the seller later opts out.
  if (
    existing?.status !== 'paid' &&
    !(await getThirdwebOrderRecipients(order, req)).includes(recipient.toLowerCase())
  ) {
    throw new APIError(
      'Every seller in this payment group must accept Thirdweb payments in USDC on Base.',
      409,
    )
  }
  if (
    order.paymentProofs?.some(
      (proof) =>
        group.targets.some((target) => target.productID === toStringID(proof.product)) &&
        (!existing?.destinationTransactionHash ||
          proof.transactionHash?.toLowerCase() !== existing.destinationTransactionHash),
    )
  ) {
    throw new APIError(
      'A payment proof already exists for this recipient. Verify that payment instead of paying again.',
      409,
    )
  }
  if (existing) {
    return req.payload.update({
      collection: 'checkout-sessions',
      depth: 0,
      id: existing.id,
      overrideAccess: true,
      req,
      data: { expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
    })
  }
  try {
    return await req.payload.create({
      collection: 'checkout-sessions',
      depth: 0,
      overrideAccess: true,
      req,
      data: {
        publicId: randomUUID(),
        order: order.id,
        orderPaymentKey: group.paymentKey,
        kind: 'order',
        title: `Order ${order.id}`,
        quantity: group.targets.reduce((total, target) => total + target.quantity, 0),
        amountUsdCents: group.amountUsdCents,
        receiver: group.receiver,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        status: 'pending',
      },
    })
  } catch (error) {
    if (
      !(
        error instanceof ValidationError &&
        error.data.errors.some((entry) => entry.path === 'orderPaymentKey')
      )
    ) {
      throw error
    }
    const concurrent = await find()
    if (!concurrent) {
      throw error
    }
    return concurrent
  }
}

/** Called only for a server-verified receipt. CAS appends preserve concurrent recipient payments. */
export const recordOrderCheckoutPayment = async (req: PayloadRequest, session: CheckoutSession) => {
  const orderId = toStringID(session.order)
  if (
    session.kind !== 'order' ||
    session.status !== 'paid' ||
    !orderId ||
    !session.destinationTransactionHash
  ) {
    throw new APIError('A verified Thirdweb order receipt is required.', 409)
  }
  if (session.orderRecordedAt) {
    return
  }
  const order = await updateAtomically({
    collection: 'orders',
    id: orderId,
    req,
    update: async (current) => {
      const group = getOrderCheckoutGroup(current, session.receiver)
      if (
        group.amountUsdCents !== session.amountUsdCents ||
        group.paymentKey !== session.orderPaymentKey
      ) {
        throw new APIError('The verified payment does not match this order snapshot.', 409)
      }
      if (current.status === 'completed') {
        if (
          !group.targets.every((target) =>
            current.paymentProofs?.some(
              (proof) =>
                toStringID(proof.product) === target.productID &&
                proof.transactionHash?.toLowerCase() === session.destinationTransactionHash,
            ),
          )
        ) {
          throw new APIError(
            'This order was already paid by a different method. Request payment review.',
            409,
          )
        }
        return null
      }
      const proofRows = group.targets.map((target) => ({
        product: target.productID,
        chain: 'ethereum' as const,
        transactionHash: session.destinationTransactionHash!,
      }))
      if (
        current.paymentProofs?.some(
          (proof) =>
            group.targets.some((target) => target.productID === toStringID(proof.product)) &&
            proof.transactionHash?.toLowerCase() !== session.destinationTransactionHash,
        )
      ) {
        throw new APIError(
          'This recipient already has a different payment proof. Do not pay again; request review.',
          409,
        )
      }
      const merged = await mergeCustomerPaymentProofs(current, proofRows, req)
      return {
        paymentProofs: (merged || current.paymentProofs || []).map((proof) =>
          proof.transactionHash === session.destinationTransactionHash
            ? { ...proof, chainId: CHECKOUT_SETTLEMENT.chainId }
            : proof,
        ),
      }
    },
  })
  const customerId = toStringID(order.customer)
  if (!customerId) {
    throw new APIError('The paid order has no customer.', 409)
  }
  const customer = await req.payload.findByID({
    collection: 'users',
    id: customerId,
    overrideAccess: true,
    req,
  })
  const customerReq = await createLocalReq({ user: customer }, req.payload)
  if (
    order.paymentTargets?.every((target) =>
      order.paymentProofs?.some((proof) => toStringID(proof.product) === target.productID),
    )
  ) {
    const { cryptoAdapter } = await import('../cryptoAdapter')
    await cryptoAdapter().confirmOrder({ data: { orderID: orderId }, req: customerReq })
  }
  await req.payload.update({
    collection: 'checkout-sessions',
    id: session.id,
    overrideAccess: true,
    req,
    data: { orderRecordedAt: new Date().toISOString() },
  })
}

export const verifyOrderCheckoutSession = async (req: PayloadRequest, session: CheckoutSession) => {
  const orderId = toStringID(session.order)
  if (!orderId || session.kind !== 'order') {
    throw new APIError('This is not an order payment session.', 400)
  }
  await requireOrderCustomer(req, orderId)
  if (session.status === 'paid') {
    await recordOrderCheckoutPayment(req, session)
  }
  return req.payload.findByID({
    collection: 'checkout-sessions',
    id: session.id,
    depth: 0,
    overrideAccess: true,
    req,
  })
}
