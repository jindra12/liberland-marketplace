import BigNumber from 'bignumber.js'
import { PAYMENT_QUOTE_VALIDITY_MS } from '../constants'
import { normalizeTransactionHash } from '../utils'
import { quantizeNativeAmount } from '../nativeAmount'
import {
  getOrderById,
  getOrderCreatedAtMs,
  getOrderCryptoPriceEntries,
  getOrderPaymentProofEntries,
  getOrderPaymentTargetEntries,
} from '../order'
import { getPayloadInstance } from '../payload'
import type {
  OrderCryptoPrice,
  SupportedChain,
  VerifyOrderPaymentResult,
  VerifyTransactionResult,
} from '../types'

type VerificationGroup = {
  chain: SupportedChain
  expectedStableAmount: BigNumber
  normalizedRecipientAddress: string
  productIDs: string[]
  recipientAddress: string
  transactionHash: string
}

const toPriceMap = (
  prices: OrderCryptoPrice[],
): Record<SupportedChain, OrderCryptoPrice | undefined> => {
  return {
    ethereum: prices.find((price) => price.chain === 'ethereum'),
    solana: prices.find((price) => price.chain === 'solana'),
    tron: prices.find((price) => price.chain === 'tron'),
  }
}

const buildGroupKey = ({
  chain,
  normalizedRecipientAddress,
  transactionHash,
}: {
  chain: SupportedChain
  normalizedRecipientAddress: string
  transactionHash: string
}): string => {
  return `${chain}:${normalizeTransactionHash(chain, transactionHash)}:${normalizedRecipientAddress}`
}

const pushEntryFailure = ({
  results,
  chain,
  transactionHash,
  productID,
  error,
}: {
  results: VerifyTransactionResult[]
  chain: SupportedChain
  transactionHash: string
  productID: string
  error: string
}) => {
  results.push({
    chain,
    error,
    ok: false,
    productIDs: [productID],
    transactionHash,
  })
}

const verifyGroup = async ({
  group,
  minTimestampMs,
  nativePerStable,
  orderID,
}: {
  group: VerificationGroup
  minTimestampMs: number
  nativePerStable: string
  orderID: string
}): Promise<VerifyTransactionResult> => {
  const expectedNativeAmount = quantizeNativeAmount(
    group.chain,
    new BigNumber(group.expectedStableAmount).times(nativePerStable),
  )

  if (group.chain === 'ethereum') {
    const { verifyEthereumNativeTransfer } = await import('./ethereum')
    return verifyEthereumNativeTransfer({
      chain: 'ethereum',
      expectedAmount: expectedNativeAmount,
      minTimestampMs,
      orderId: orderID,
      recipientAddress: group.recipientAddress,
      transactionHash: group.transactionHash,
    })
  }

  if (group.chain === 'solana') {
    const { verifySolanaPayTransaction } = await import('./solanaPay')
    return verifySolanaPayTransaction({
      chain: 'solana',
      expectedAmount: expectedNativeAmount,
      minTimestampMs,
      orderId: orderID,
      recipientAddress: group.recipientAddress,
      transactionHash: group.transactionHash,
    })
  }

  const { verifyTronNativeTransfer } = await import('./tron')
  return verifyTronNativeTransfer({
    chain: 'tron',
    expectedAmount: expectedNativeAmount,
    minTimestampMs,
    orderId: orderID,
    recipientAddress: group.recipientAddress,
    transactionHash: group.transactionHash,
  })
}

export const verifyTransactionOccurred = async (
  orderId: string,
): Promise<VerifyOrderPaymentResult> => {
  const order = await getOrderById(orderId)
  const txEntries = getOrderPaymentProofEntries(order)

  if (txEntries.length === 0) {
    return {
      orderId: order.id,
      ok: false,
      error: 'Order has no paymentProofs entries to verify.',
      results: [],
    }
  }

  const payload = await getPayloadInstance()
  const results: VerifyTransactionResult[] = []
  const snapshotTargets = getOrderPaymentTargetEntries(order)
  let productTargets = snapshotTargets

  if (productTargets.length === 0) {
    const { resolveProductPaymentTargetsFromItems } = await import('../recipient')

    try {
      productTargets = await resolveProductPaymentTargetsFromItems({
        items: order.items,
        payload,
      })
    } catch (error) {
      return {
        orderId: order.id,
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to resolve order payout targets.',
        results: [],
      }
    }
  }

  const targetByProductID = new Map(productTargets.map((target) => [target.productID, target]))
  const assignedProducts = new Set<string>()
  const groupsByKey = new Map<string, VerificationGroup>()

  for (const txEntry of txEntries) {
    const target = targetByProductID.get(txEntry.productID)
    if (!target) {
      pushEntryFailure({
        chain: txEntry.chain,
        error: `Product ${txEntry.productID} is not part of this order items payload.`,
        productID: txEntry.productID,
        results,
        transactionHash: txEntry.transactionHash,
      })
      continue
    }

    if (assignedProducts.has(txEntry.productID)) {
      pushEntryFailure({
        chain: txEntry.chain,
        error: `Product ${txEntry.productID} is mapped to multiple transaction hash entries.`,
        productID: txEntry.productID,
        results,
        transactionHash: txEntry.transactionHash,
      })
      continue
    }

    if (txEntry.chain !== target.chain) {
      pushEntryFailure({
        chain: txEntry.chain,
        error: `Product ${txEntry.productID} expects ${target.chain} payout, but transaction entry uses ${txEntry.chain}.`,
        productID: txEntry.productID,
        results,
        transactionHash: txEntry.transactionHash,
      })
      continue
    }

    assignedProducts.add(txEntry.productID)

    const groupKey = buildGroupKey({
      chain: txEntry.chain,
      normalizedRecipientAddress: target.normalizedRecipientAddress,
      transactionHash: txEntry.transactionHash,
    })

    const existing = groupsByKey.get(groupKey)
    if (existing) {
      existing.expectedStableAmount = existing.expectedStableAmount.plus(target.stableAmount)
      existing.productIDs.push(txEntry.productID)
      continue
    }

    groupsByKey.set(groupKey, {
      chain: txEntry.chain,
      expectedStableAmount: new BigNumber(target.stableAmount),
      normalizedRecipientAddress: target.normalizedRecipientAddress,
      productIDs: [txEntry.productID],
      recipientAddress: target.recipientAddress,
      transactionHash: normalizeTransactionHash(txEntry.chain, txEntry.transactionHash),
    })
  }

  for (const target of productTargets) {
    if (assignedProducts.has(target.productID)) {
      continue
    }

    results.push({
      chain: target.chain,
      error: `Missing transaction hash entry for product ${target.productID}.`,
      ok: false,
      productIDs: [target.productID],
    })
  }

  const priceMap = toPriceMap(getOrderCryptoPriceEntries(order))
  const minTimestampMs = getOrderCreatedAtMs(order)

  for (const group of groupsByKey.values()) {
    const price = priceMap[group.chain]
    const rate = new BigNumber(String(price?.nativePerStable))
    const fetchedAt = Date.parse(price?.fetchedAt || '')
    if (
      !rate.isFinite() ||
      !rate.isPositive() ||
      !Number.isFinite(fetchedAt) ||
      fetchedAt > Date.now()
    ) {
      results.push({
        chain: group.chain,
        ok: false,
        productIDs: group.productIDs,
        transactionHash: group.transactionHash,
        error: 'The locked payment quote is missing or invalid.',
      })
      continue
    }

    const groupResult = await verifyGroup({
      group,
      minTimestampMs,
      nativePerStable: rate.toFixed(),
      orderID: order.id,
    })

    const paidAt = groupResult.observedTimestampMs
    const validQuote =
      paidAt !== undefined && paidAt >= fetchedAt && paidAt <= fetchedAt + PAYMENT_QUOTE_VALIDITY_MS
    results.push({
      ...groupResult,
      ...(groupResult.ok && !validQuote
        ? {
            ok: false,
            error: 'The payment was not included within the locked quote validity period.',
          }
        : {}),
      productIDs: group.productIDs,
      recipientAddress: group.recipientAddress,
      transactionHash: groupResult.transactionHash ?? group.transactionHash,
    })
  }

  return {
    orderId: order.id,
    ok: results.length > 0 && results.every((result) => result.ok),
    results,
  }
}
