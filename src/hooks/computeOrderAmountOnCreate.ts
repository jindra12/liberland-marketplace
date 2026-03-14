import { APIError, type CollectionBeforeChangeHook, type PayloadRequest } from 'payload'

type PriceableDoc = {
  [key: string]: unknown
  product?: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const toDocID = (value: unknown): string | null => {
  if (typeof value === 'string' || typeof value === 'number') {
    const id = String(value).trim()
    return id.length > 0 ? id : null
  }

  if (isRecord(value)) {
    return toDocID(value.id)
  }

  return null
}

const ORDER_CURRENCY = 'USD'
const PRICE_FIELD = 'priceInUSD'
const PRICE_ENABLED_FIELD = 'priceInUSDEnabled'

const readEnabledPrice = ({
  doc,
  enabledField,
  priceField,
}: {
  doc: PriceableDoc
  enabledField: string
  priceField: string
}): number | null => {
  if (doc[enabledField] !== true) {
    return null
  }

  const price = Number(doc[priceField])
  if (!Number.isFinite(price) || price < 0) {
    return null
  }

  return price
}

const findByID = async ({
  collection,
  id,
  req,
  select,
}: {
  collection: 'products' | 'variants'
  id: string
  req: PayloadRequest
  select: Record<string, true>
}): Promise<PriceableDoc> => {
  const doc = await req.payload.findByID({
    collection,
    id,
    depth: 0,
    overrideAccess: false,
    req,
    select,
  })

  if (!isRecord(doc)) {
    throw new APIError(`Unable to read ${collection} ${id} while computing order amount.`, 400)
  }

  return doc
}

const getUnitPriceForItem = async ({
  enabledField,
  item,
  priceField,
  productCache,
  req,
  variantCache,
}: {
  enabledField: string
  item: Record<string, unknown>
  priceField: string
  productCache: Map<string, PriceableDoc>
  req: PayloadRequest
  variantCache: Map<string, PriceableDoc>
}): Promise<number> => {
  const variantID = toDocID(item.variant)
  let productID = toDocID(item.product)

  if (variantID) {
    let variant = variantCache.get(variantID)
    if (!variant) {
      variant = await findByID({
        collection: 'variants',
        id: variantID,
        req,
        select: {
          [enabledField]: true,
          [priceField]: true,
          product: true,
        },
      })
      variantCache.set(variantID, variant)
    }

    const variantPrice = readEnabledPrice({
      doc: variant,
      enabledField,
      priceField,
    })

    if (variantPrice !== null) {
      return variantPrice
    }

    productID = productID ?? toDocID(variant.product)
  }

  if (!productID) {
    throw new APIError('Each order item must include a product or a variant linked to a product.', 400)
  }

  let product = productCache.get(productID)
  if (!product) {
    product = await findByID({
      collection: 'products',
      id: productID,
      req,
      select: {
        [enabledField]: true,
        [priceField]: true,
      },
    })
    productCache.set(productID, product)
  }

  const productPrice = readEnabledPrice({
    doc: product,
    enabledField,
    priceField,
  })

  if (productPrice === null) {
    throw new APIError(
      `Product ${productID} is missing a valid ${priceField} value. Enable ${enabledField} and set a numeric price.`,
      400,
    )
  }

  return productPrice
}

export const computeOrderAmountOnCreate: CollectionBeforeChangeHook = async ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create' || !data) {
    return data
  }

  const next = { ...data }
  const rawItems = next.items
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new APIError('Order must contain at least one item.', 400)
  }

  const productCache = new Map<string, PriceableDoc>()
  const variantCache = new Map<string, PriceableDoc>()

  let total = 0

  for (let index = 0; index < rawItems.length; index += 1) {
    const item = rawItems[index]
    if (!isRecord(item)) {
      throw new APIError(`Order item at index ${index} is invalid.`, 400)
    }

    const quantity = Number(item.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new APIError(`Order item at index ${index} has invalid quantity.`, 400)
    }

    const unitPrice = await getUnitPriceForItem({
      enabledField: PRICE_ENABLED_FIELD,
      item,
      priceField: PRICE_FIELD,
      productCache,
      req,
      variantCache,
    })

    total += unitPrice * quantity
  }

  if (!Number.isFinite(total) || total < 0) {
    throw new APIError('Failed to compute order amount from items.', 400)
  }

  next.currency = ORDER_CURRENCY
  next.amount = total

  return next
}
