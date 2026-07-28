import BigNumber from 'bignumber.js'
import { decimalToUnits } from '@/crypto/math'
import { getChainNativeDecimals } from '@/crypto/nativeAmount'
import type { SupportedChain } from '@/crypto/types'
import type { CollectionAfterReadHook, PayloadRequest } from 'payload'

const USD_BASE_DIVISOR = 100n
const RATE_SCALE_DECIMALS = 18

type ProductCryptoPriceDoc = {
  priceInETH?: null | string
  priceInSOL?: null | string
  priceInTRX?: null | string
  priceInUSD?: unknown
  priceInUSDEnabled?: unknown
}

type CryptoRateSnapshot = {
  rates?: Partial<Record<SupportedChain, { nativePerStable?: unknown }>>
}

const rateSnapshotByRequest = new WeakMap<
  PayloadRequest,
  CryptoRateSnapshot | null
>()

const pow10 = (exponent: number): bigint => 10n ** BigInt(exponent)

const formatUnitsAsDecimalString = ({
  decimals,
  value,
}: {
  decimals: number
  value: bigint
}): string => {
  const base = pow10(decimals)
  const whole = value / base
  const fraction = value % base

  if (fraction === 0n) {
    return whole.toString()
  }

  const fractionString = fraction.toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${whole.toString()}.${fractionString}`
}

const parsePriceInUSDCents = (value: unknown): bigint | null => {
  const parsed = new BigNumber(String(value))
  if (!parsed.isFinite() || parsed.isNegative() || !parsed.isInteger()) {
    return null
  }

  return BigInt(parsed.toFixed(0))
}

const parseNativePerStable = (value: unknown): bigint | null => {
  const parsed = new BigNumber(String(value))
  if (!parsed.isFinite() || parsed.isLessThanOrEqualTo(0)) {
    return null
  }

  try {
    return decimalToUnits(parsed.toFixed(RATE_SCALE_DECIMALS), RATE_SCALE_DECIMALS)
  } catch {
    return null
  }
}

const toChainNativePrice = ({
  chain,
  nativePerStable,
  priceInUSDCents,
}: {
  chain: SupportedChain
  nativePerStable: unknown
  priceInUSDCents: bigint
}): null | string => {
  const nativePerStableUnits = parseNativePerStable(nativePerStable)
  if (nativePerStableUnits === null) {
    return null
  }

  const nativeAmountAtRateScale = (priceInUSDCents * nativePerStableUnits) / USD_BASE_DIVISOR
  const chainDecimals = getChainNativeDecimals(chain)

  const chainUnits =
    RATE_SCALE_DECIMALS === chainDecimals
      ? nativeAmountAtRateScale
      : RATE_SCALE_DECIMALS > chainDecimals
        ? nativeAmountAtRateScale / pow10(RATE_SCALE_DECIMALS - chainDecimals)
        : nativeAmountAtRateScale * pow10(chainDecimals - RATE_SCALE_DECIMALS)

  return formatUnitsAsDecimalString({
    decimals: chainDecimals,
    value: chainUnits,
  })
}

const getCachedRatesForRequest = async (req: PayloadRequest) => {
  if (rateSnapshotByRequest.has(req)) {
    return rateSnapshotByRequest.get(req) ?? null
  }

  const { getCryptoRateCacheSnapshot } = await import('@/crypto/rates/cache')
  const snapshot = await getCryptoRateCacheSnapshot({ payload: req.payload })
  rateSnapshotByRequest.set(req, snapshot)
  return snapshot
}

const clearCryptoPrices = (doc: ProductCryptoPriceDoc): ProductCryptoPriceDoc => {
  doc.priceInETH = null
  doc.priceInSOL = null
  doc.priceInTRX = null
  return doc
}

export const populateProductCryptoPrices: CollectionAfterReadHook = async ({ doc, req }) => {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return doc
  }

  const productDoc = doc as ProductCryptoPriceDoc
  if (productDoc.priceInUSDEnabled !== true) {
    return clearCryptoPrices(productDoc)
  }

  const priceInUSDCents = parsePriceInUSDCents(productDoc.priceInUSD)
  if (priceInUSDCents === null) {
    return clearCryptoPrices(productDoc)
  }

  const snapshot = await getCachedRatesForRequest(req)
  const rates = snapshot?.rates

  productDoc.priceInETH = toChainNativePrice({
    chain: 'ethereum',
    nativePerStable: rates?.ethereum?.nativePerStable,
    priceInUSDCents,
  })
  productDoc.priceInSOL = toChainNativePrice({
    chain: 'solana',
    nativePerStable: rates?.solana?.nativePerStable,
    priceInUSDCents,
  })
  productDoc.priceInTRX = toChainNativePrice({
    chain: 'tron',
    nativePerStable: rates?.tron?.nativePerStable,
    priceInUSDCents,
  })

  return productDoc
}
