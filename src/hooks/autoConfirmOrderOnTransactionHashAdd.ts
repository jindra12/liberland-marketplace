import { cryptoAdapter } from '@/payments/cryptoAdapter'
import type { CollectionAfterChangeHook } from 'payload'

type TransactionHashRow = {
  chain?: unknown
  product?: unknown
  productID?: unknown
  transactionHash?: unknown
  txHash?: unknown
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

const asString = (value: unknown): string => {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim().toLowerCase()
}

const getHashRows = (value: unknown): TransactionHashRow[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((row): row is TransactionHashRow => isRecord(row))
}

const rowKey = (row: TransactionHashRow): string => {
  const productID = toDocID(row.productID ?? row.product) ?? ''
  return `${productID}|${asString(row.chain)}|${asString(row.transactionHash ?? row.txHash)}`
}

export const autoConfirmOrderOnTransactionHashAdd: CollectionAfterChangeHook = async ({
  context,
  doc,
  operation,
  previousDoc,
  req,
}) => {
  if (operation !== 'update' || context?.skipAutoOrderCryptoConfirm) {
    return doc
  }

  const orderDoc = isRecord(doc) ? doc : {}
  const status = typeof orderDoc.status === 'string' ? orderDoc.status : null
  if (status !== 'processing') {
    return doc
  }

  const currentRows = getHashRows(orderDoc.transactionHashes)
  if (currentRows.length === 0) {
    return doc
  }

  const previousRows = getHashRows(isRecord(previousDoc) ? previousDoc.transactionHashes : undefined)
  const previousKeys = new Set(previousRows.map(rowKey))
  const hasNewRow = currentRows.some((row) => !previousKeys.has(rowKey(row)))
  if (!hasNewRow) {
    return doc
  }

  const orderID = toDocID(orderDoc.id)
  if (!orderID) {
    return doc
  }

  try {
    await cryptoAdapter().confirmOrder({
      cartsSlug: 'carts',
      data: { orderID },
      ordersSlug: 'orders',
      req,
      transactionsSlug: 'transactions',
    })
  } catch (error) {
    req.payload.logger.error(error, `Auto-confirm failed for order ${orderID}`)
  }

  return doc
}
