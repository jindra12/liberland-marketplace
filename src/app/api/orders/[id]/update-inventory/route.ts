import type { Order, Product, Variant } from '@/payload-types'
import { APIError, createLocalReq, getPayload } from 'payload'
import config from '@payload-config'
import { headers } from 'next/headers'
import type { PayloadRequest } from 'payload'

type InventoryOrderItem = NonNullable<Order['items']>[number]

type InventoryTarget = {
  id: string
  kind: 'product' | 'variant'
  quantity: number
}

type InventoryChange = {
  id: string
  kind: 'product' | 'variant'
  nextInventory: number
}

const toRelationID = (value: string | { id: string } | null | undefined): string | null => {
  if (typeof value === 'string') {
    return value
  }

  return value?.id ?? null
}

const extractOrderID = (request: Request): string | null => {
  const pathname = new URL(request.url).pathname
  const match = pathname.match(/\/api\/orders\/([^/]+)\/update-inventory\/?$/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

const buildInventoryTargets = (items: InventoryOrderItem[]): InventoryTarget[] => {
  const targets = items.reduce((accumulator, item) => {
    const quantity = item.quantity
    const variantID = toRelationID(item.variant)
    const productID = toRelationID(item.product)

    if (!variantID && !productID) {
      throw new APIError('Order item is missing a product or variant.', 400)
    }

    const target = variantID
      ? { id: variantID, kind: 'variant' as const, quantity }
      : { id: productID ?? '', kind: 'product' as const, quantity }

    const key = `${target.kind}:${target.id}`
    const existing = accumulator.get(key)
    if (existing) {
      existing.quantity += target.quantity
      return accumulator
    }

    accumulator.set(key, { ...target })
    return accumulator
  }, new Map<string, InventoryTarget>())

  return Array.from(targets.values())
}

const loadOrder = async ({
  orderID,
  req,
}: {
  orderID: string
  req: PayloadRequest
}): Promise<Order> => {
  return req.payload.findByID({
    collection: 'orders',
    depth: 0,
    id: orderID,
    overrideAccess: false,
    req,
  }) as Promise<Order>
}

const loadProduct = async ({
  productID,
  req,
}: {
  productID: string
  req: PayloadRequest
}): Promise<Product> => {
  return req.payload.findByID({
    collection: 'products',
    depth: 0,
    id: productID,
    overrideAccess: false,
    req,
  }) as Promise<Product>
}

const loadVariant = async ({
  req,
  variantID,
}: {
  req: PayloadRequest
  variantID: string
}): Promise<Variant> => {
  return req.payload.findByID({
    collection: 'variants',
    depth: 0,
    id: variantID,
    overrideAccess: false,
    req,
  }) as Promise<Variant>
}

const updateProductInventory = async ({
  product,
  quantity,
  req,
}: {
  product: Product
  quantity: number
  req: PayloadRequest
}): Promise<InventoryTarget | null> => {
  const currentInventory = product.inventory ?? 0

  if (product.unlimitedInventory || currentInventory <= 0) {
    return null
  }

  const nextInventory = Math.max(0, currentInventory - quantity)
  if (nextInventory === currentInventory) {
    return null
  }

  await req.payload.update({
    collection: 'products',
    data: {
      inventory: nextInventory,
    },
    id: product.id,
    overrideAccess: false,
    req,
  })

  return {
    id: product.id,
    kind: 'product',
    quantity: nextInventory,
  }
}

const updateVariantInventory = async ({
  quantity,
  req,
  variant,
}: {
  quantity: number
  req: PayloadRequest
  variant: Variant
}): Promise<InventoryTarget | null> => {
  const productID = toRelationID(variant.product)
  const currentInventory = variant.inventory ?? 0

  if (!productID || currentInventory <= 0) {
    return null
  }

  const product = await loadProduct({
    productID,
    req,
  })

  if (product.unlimitedInventory) {
    return null
  }

  const nextInventory = Math.max(0, currentInventory - quantity)
  if (nextInventory === currentInventory) {
    return null
  }

  await req.payload.update({
    collection: 'variants',
    data: {
      inventory: nextInventory,
    },
    id: variant.id,
    overrideAccess: false,
    req,
  })

  return {
    id: variant.id,
    kind: 'variant',
    quantity: nextInventory,
  }
}

export const POST = async (request: Request): Promise<Response> => {
  const orderID = extractOrderID(request)
  if (!orderID) {
    return Response.json({ error: 'Order ID is required.' }, { status: 400 })
  }

  const payload = await getPayload({ config })
  const requestHeaders = await headers()
  const { user } = await payload.auth({ headers: requestHeaders })

  if (!user?.role?.includes('admin')) {
    return Response.json({ error: 'Admin access required.' }, { status: 403 })
  }

  try {
    const req = await createLocalReq({ user }, payload)
    const order = await loadOrder({
      orderID,
      req,
    })

    if (!order.items?.length) {
      throw new APIError('Order has no items to update.', 400)
    }

    const targets = buildInventoryTargets(order.items)
    const changes = await Promise.all(
      targets.map(async (target) => {
        if (target.kind === 'product') {
          const product = await loadProduct({
            productID: target.id,
            req,
          })

          return updateProductInventory({
            product,
            quantity: target.quantity,
            req,
          })
        }

        const variant = await loadVariant({
          req,
          variantID: target.id,
        })

        return updateVariantInventory({
          quantity: target.quantity,
          req,
          variant,
        })
      }),
    )

    return Response.json({
      orderID,
      updated: changes.flatMap((change): InventoryChange[] =>
        change
          ? [
              {
                id: change.id,
                kind: change.kind,
                nextInventory: change.quantity,
              },
            ]
          : [],
      ),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update order inventory.'
    return Response.json({ error: message }, { status: 400 })
  }
}
