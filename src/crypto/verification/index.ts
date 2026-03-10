import BigNumber from 'bignumber.js'
import { quantizeNativeAmount } from '../nativeAmount'
import { getOrderById, getOrderCreatedAtMs, getOrderCryptoPriceEntries, getOrderTransactionHashEntries } from '../order'
import { getPayloadInstance } from '../payload'
import { resolveProductPaymentTargetsFromItems } from '../recipient'
import type { OrderCryptoPrice, SupportedChain, VerifyOrderPaymentResult, VerifyTransactionResult } from '../types'
import { verifyEthereumNativeTransfer } from './ethereum'
import { verifySolanaPayTransaction } from './solanaPay'
import { verifyTronNativeTransfer } from './tron'

type VerificationGroup = {
  chain: SupportedChain
  expectedStableAmount: number
  normalizedRecipientAddress: string
  productIDs: string[]
  recipientAddress: string
  transactionHash: string
}

const toPriceMap = (prices: OrderCryptoPrice[]): Record<SupportedChain, OrderCryptoPrice | undefined> => {
  return {
    ethereum: prices.find((price) => price.chain === 'ethereum'),
    solana: prices.find((price) => price.chain === 'solana'),
    tron: prices.find((price) => price.chain === 'tron'),
  }
}

const getNativePerStable = (price?: OrderCryptoPrice): string | null => {
  const raw = price?.nativePerStable
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null
  }

  const parsed = new BigNumber(raw)
  if (!parsed.isFinite() || parsed.lte(0)) {
    return null
  }

  return parsed.toFixed()
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
  return `${chain}:${transactionHash}:${normalizedRecipientAddress}`
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
    return verifyEthereumNativeTransfer({
      chain: 'ethereum',
      expectedAmount: expectedNativeAmount,
      minTimestampMs,
      orderIdToExclude: orderID,
      recipientAddress: group.recipientAddress,
      transactionHash: group.transactionHash,
    })
  }

  if (group.chain === 'solana') {
    return verifySolanaPayTransaction({
      chain: 'solana',
      expectedAmount: expectedNativeAmount,
      minTimestampMs,
      orderId: orderID,
      recipientAddress: group.recipientAddress,
      transactionHash: group.transactionHash,
    })
  }

  return verifyTronNativeTransfer({
    chain: 'tron',
    expectedAmount: expectedNativeAmount,
    minTimestampMs,
    orderIdToExclude: orderID,
    recipientAddress: group.recipientAddress,
    transactionHash: group.transactionHash,
  })
}

export const verifyTransactionOccurred = async (orderId: string): Promise<VerifyOrderPaymentResult> => {
  const order = await getOrderById(orderId)
  const txEntries = getOrderTransactionHashEntries(order)

  if (txEntries.length === 0) {
    return {
      orderId: order.id,
      ok: false,
      error: 'Order has no transactionHashes entries to verify.',
      results: [],
    }
  }

  const payload = await getPayloadInstance()
  const results: VerifyTransactionResult[] = []

  let productTargets: Awaited<ReturnType<typeof resolveProductPaymentTargetsFromItems>>
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
      existing.expectedStableAmount += target.stableAmount
      existing.productIDs.push(txEntry.productID)
      continue
    }

    groupsByKey.set(groupKey, {
      chain: txEntry.chain,
      expectedStableAmount: target.stableAmount,
      normalizedRecipientAddress: target.normalizedRecipientAddress,
      productIDs: [txEntry.productID],
      recipientAddress: target.recipientAddress,
      transactionHash: txEntry.transactionHash,
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
    const nativePerStable = getNativePerStable(priceMap[group.chain])
    if (nativePerStable === null) {
      results.push({
        chain: group.chain,
        error: `Missing locked nativePerStable rate for ${group.chain} on this order.`,
        ok: false,
        productIDs: group.productIDs,
        recipientAddress: group.recipientAddress,
        transactionHash: group.transactionHash,
      })
      continue
    }

    const groupResult = await verifyGroup({
      group,
      minTimestampMs,
      nativePerStable,
      orderID: order.id,
    })

    results.push({
      ...groupResult,
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
