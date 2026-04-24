import type { CollectionAfterChangeHook } from 'payload'

import { resolveProductIDsForItems } from '@/crypto/recipient'

type OrderDoc = {
  id?: unknown
  items?: unknown
  status?: unknown
}

type ProductPurchaseCountDoc = {
  purchaseCount?: number | null
}

const getStatus = (value: unknown): string | null => {
  return typeof value === 'string' ? value : null
}

const shouldIncrementPurchaseCount = ({
  doc,
  operation,
  previousDoc,
}: {
  doc: OrderDoc
  operation: string
  previousDoc?: OrderDoc
}): boolean => {
  const nextStatus = getStatus(doc.status)
  if (nextStatus !== 'completed') {
    return false
  }

  if (operation === 'create') {
    return true
  }

  const previousStatus = getStatus(previousDoc?.status)
  return previousStatus !== 'completed'
}

export const updateProductPurchaseCountAfterOrderValidation: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  const orderDoc = doc as OrderDoc

  if (!shouldIncrementPurchaseCount({ doc: orderDoc, operation, previousDoc: previousDoc as OrderDoc })) {
    return doc
  }

  const productIDs = await resolveProductIDsForItems({
    items: orderDoc.items,
    payload: req.payload,
    req,
  })

  await Promise.all(
    Array.from(new Set(productIDs)).map(async (productID) => {
      const product = (await req.payload.findByID({
        collection: 'products',
        depth: 0,
        id: productID,
        overrideAccess: true,
        req,
      })) as ProductPurchaseCountDoc

      const nextPurchaseCount =
        typeof product.purchaseCount === 'number' ? product.purchaseCount + 1 : 1

      await req.payload.update({
        collection: 'products',
        data: { purchaseCount: nextPurchaseCount },
        id: productID,
        overrideAccess: true,
        req,
      })
    }),
  )

  return doc
}
