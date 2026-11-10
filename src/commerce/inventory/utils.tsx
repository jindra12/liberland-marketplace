import { APIError, type PayloadRequest } from 'payload'
import type { Order, Product, Variant } from '@/payload-types'
import { toStringID } from '@/utilities/toStringID'
import { updateAtomically } from '@/utilities/atomicUpdates/utils'

type InventoryTarget = { id: string; collection: 'products' | 'variants'; quantity: number }

const buildTargets = (items: NonNullable<Order['items']>): InventoryTarget[] =>
  Array.from(
    items
      .reduce((targets, item) => {
        if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
          throw new APIError('Inventory quantities must be positive integers.', 400)
        }
        const variant = toStringID(item.variant)
        const id = variant || toStringID(item.product)
        if (!id) {
          throw new APIError('Order item is missing a product or variant.', 400)
        }
        const collection = variant ? 'variants' : 'products'
        const key = `${collection}:${id}`
        const quantity = (targets.get(key)?.quantity || 0) + item.quantity
        if (!Number.isSafeInteger(quantity)) {
          throw new APIError('Combined inventory quantity is too large.', 400)
        }
        targets.set(key, { id, collection, quantity })
        return targets
      }, new Map<string, InventoryTarget>())
      .values(),
  )

const isUnlimited = async (
  target: InventoryTarget,
  doc: Product | Variant,
  req: PayloadRequest,
) => {
  if (target.collection === 'products' && 'unlimitedInventory' in doc) {
    return Boolean(doc.unlimitedInventory)
  }
  if (!('product' in doc)) {
    return false
  }
  const parentID = toStringID(doc.product)
  if (!parentID) {
    throw new APIError('Variant is missing its product.', 400)
  }
  const product = await req.payload.findByID({
    collection: 'products',
    id: parentID,
    depth: 0,
    overrideAccess: false,
    req,
  })
  return Boolean(product.unlimitedInventory)
}

export const applyOrderInventory = async (orderID: string, req: PayloadRequest) => {
  const order = await req.payload.findByID({
    collection: 'orders',
    id: orderID,
    depth: 0,
    overrideAccess: false,
    showHiddenFields: true,
    req,
  })
  if (order.inventoryAppliedAt) {
    return []
  }
  if (order.status !== 'completed' || !order.items?.length) {
    throw new APIError('Only completed orders with items can deduct inventory.', 409)
  }
  const targets = buildTargets(order.items)
  // Validate every line before the first write. Later contention remains safely resumable.
  await targets.reduce(async (previous, target) => {
    await previous
    const doc = await req.payload.db.findOne<Product | Variant>({
      collection: target.collection,
      where: { id: { equals: target.id } },
      req,
    })
    if (!doc) {
      throw new APIError('An ordered inventory item no longer exists.', 409)
    }
    if (
      !doc.inventoryApplications?.includes(orderID) &&
      !(await isUnlimited(target, doc, req)) &&
      (doc.inventory || 0) < target.quantity
    ) {
      throw new APIError('Insufficient inventory. Retry this order after replenishing stock.', 409)
    }
  }, Promise.resolve())
  const updated = await targets.reduce(async (previous, target) => {
    const changes = await previous
    const doc = await updateAtomically({
      collection: target.collection,
      id: target.id,
      req,
      update: async (current) => {
        if (current.inventoryApplications?.includes(orderID)) {
          return null
        }
        const inventoryApplications = [...(current.inventoryApplications || []), orderID]
        if (await isUnlimited(target, current, req)) {
          return { inventoryApplications }
        }
        if ((current.inventory || 0) < target.quantity) {
          throw new APIError(
            'Inventory application is incomplete. Retry this same order after replenishing stock; applied lines will not be deducted twice.',
            409,
          )
        }
        return { inventory: (current.inventory || 0) - target.quantity, inventoryApplications }
      },
    })
    return [
      ...changes,
      {
        id: target.id,
        kind: target.collection === 'products' ? 'product' : 'variant',
        nextInventory: doc.inventory || 0,
      },
    ]
  }, Promise.resolve<Array<{ id: string; kind: string; nextInventory: number }>>([]))
  await updateAtomically({
    collection: 'orders',
    id: orderID,
    req,
    update: (current) =>
      current.inventoryAppliedAt ? null : { inventoryAppliedAt: new Date().toISOString() },
  })
  return updated
}
