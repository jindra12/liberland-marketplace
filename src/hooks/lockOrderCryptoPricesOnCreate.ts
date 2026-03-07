import type { CollectionBeforeChangeHook } from 'payload'
import { buildOrderCryptoPrices } from '@/crypto/rates'
import type { SupportedChain } from '@/crypto/types'

const isSupportedChain = (chain: unknown): chain is SupportedChain =>
  chain === 'ethereum' || chain === 'solana' || chain === 'tron'

const extractTransactionChains = (transactionHashes: unknown): SupportedChain[] => {
  if (!Array.isArray(transactionHashes)) {
    return []
  }

  return transactionHashes
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null
      }

      const chain = (entry as { chain?: unknown }).chain
      return isSupportedChain(chain) ? chain : null
    })
    .filter((chain): chain is SupportedChain => Boolean(chain))
}

type PriceSnapshot = Awaited<ReturnType<typeof buildOrderCryptoPrices>>[number]

const toGroupPrice = (price?: PriceSnapshot) => {
  if (!price) {
    return null
  }

  return {
    stablePerNative: price.stablePerNative,
    nativePerStable: price.nativePerStable,
    expectedNativeAmount: price.expectedNativeAmount ?? null,
    fetchedAt: price.fetchedAt,
  }
}

export const lockOrderCryptoPricesOnCreate: CollectionBeforeChangeHook = async ({ data, operation }) => {
  if (operation !== 'create') {
    return data
  }

  const next = { ...(data ?? {}) }
  const orderAmount = typeof next.amount === 'number' ? next.amount : null
  const chains = extractTransactionChains(next.transactionHashes)

  const prices = await buildOrderCryptoPrices({
    orderAmount,
    chains,
  })
  const priceByChain = prices.reduce<Record<SupportedChain, PriceSnapshot | undefined>>(
    (acc, price) => {
      acc[price.chain] = price
      return acc
    },
    {
      ethereum: undefined,
      solana: undefined,
      tron: undefined,
    },
  )

  next.cryptoPrices = prices
  next.ethPrice = toGroupPrice(priceByChain.ethereum)
  next.solanaPrice = toGroupPrice(priceByChain.solana)
  next.tronPrice = toGroupPrice(priceByChain.tron)

  return next
}
