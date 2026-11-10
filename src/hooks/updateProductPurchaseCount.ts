import { APIError, type CollectionAfterChangeHook, type PayloadRequest } from 'payload'
import type { Order } from '@/payload-types'
import { resolveProductIDsForItems } from '@/crypto/recipient'
import { updateAtomically } from '@/utilities/atomicUpdates/utils'
import { calculateContentRankScore } from './computeContentRanking'

/** Receipts live with each increment, so retries recover a partially applied order. */
export const applyOrderPurchaseCounts = async (
  orderID: string,
  req: PayloadRequest,
  previousStatus?: Order['status'],
) => {
  const order = await req.payload.db.findOne<Order>({
    collection: 'orders',
    where: { id: { equals: orderID } },
    req,
  })
  if (!order || order.status !== 'completed' || order.purchaseCountAppliedAt) {
    return
  }
  if (previousStatus === 'completed' && !order.purchaseCountStartedAt) {
    return
  }
  const quantities = await (order.items || []).reduce(async (previous, item) => {
    const totals = await previous
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new APIError('Purchased quantities must be positive integers.', 400)
    }
    const [id] = await resolveProductIDsForItems({ items: [item], payload: req.payload, req })
    const quantity = (totals.get(id) || 0) + item.quantity
    if (!Number.isSafeInteger(quantity)) {
      throw new APIError('Combined purchase quantity is too large.', 400)
    }
    totals.set(id, quantity)
    return totals
  }, Promise.resolve(new Map<string, number>()))
  await updateAtomically({
    collection: 'orders',
    id: orderID,
    req,
    update: (current) =>
      current.purchaseCountStartedAt ? null : { purchaseCountStartedAt: new Date().toISOString() },
  })
  await Array.from(quantities).reduce(async (previous, [id, quantity]) => {
    await previous
    await updateAtomically({
      collection: 'products',
      id,
      req,
      update: (product) => {
        if (product.purchaseApplications?.includes(orderID)) {
          return null
        }
        const total = (product.purchaseCount || 0) + quantity
        if (!Number.isSafeInteger(total)) {
          throw new APIError('Purchase count is too large.', 409)
        }
        return {
          purchaseCount: total,
          contentRankScore: calculateContentRankScore({ ...product, purchaseCount: total }),
          purchaseApplications: [...(product.purchaseApplications || []), orderID],
        }
      },
    })
  }, Promise.resolve())
  await updateAtomically({
    collection: 'orders',
    id: orderID,
    req,
    update: (current) =>
      current.purchaseCountAppliedAt ? null : { purchaseCountAppliedAt: new Date().toISOString() },
  })
}

export const updateProductPurchaseCountAfterOrderValidation: CollectionAfterChangeHook<
  Order
> = async ({ doc, previousDoc, req }) => {
  if (doc.status === 'completed') {
    await applyOrderPurchaseCounts(doc.id, req, previousDoc?.status)
  }
  return doc
}
