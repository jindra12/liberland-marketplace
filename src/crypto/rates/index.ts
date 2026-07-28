import BigNumber from 'bignumber.js'
import type { ChainPoolRate, NativeStablePoolRates, OrderCryptoPrice, SupportedChain } from '../types'
import { quantizeNativeAmount } from '../nativeAmount'
import { withTimeout } from '../timeout'

const DEFAULT_RATE_FETCH_TIMEOUT_MS = 60_000

const unique = <T>(values: T[]): T[] => [...new Set(values)]
const toDecimalString = (value: BigNumber.Value): string => new BigNumber(value).toFixed()

const parseTimeoutMs = (): number => {
  const raw = process.env.CRYPTO_RATE_FETCH_TIMEOUT_MS
  if (!raw) {
    return DEFAULT_RATE_FETCH_TIMEOUT_MS
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_RATE_FETCH_TIMEOUT_MS
  }

  return parsed
}

const getRateByChain = async (chain: SupportedChain): Promise<ChainPoolRate> => {
  if (chain === 'ethereum') {
    const { getEthereumPoolRate } = await import('./ethereum')
    return getEthereumPoolRate()
  }

  if (chain === 'solana') {
    const { getSolanaPoolRate } = await import('./solana')
    return getSolanaPoolRate()
  }

  const { getTronPoolRate } = await import('./tron')
  return getTronPoolRate()
}

const toRateSnapshot = (orderAmount: number | null, rate: ChainPoolRate): OrderCryptoPrice => {
  const expectedNativeAmount =
    typeof orderAmount === 'number' && Number.isFinite(orderAmount) && orderAmount > 0
      ? quantizeNativeAmount(rate.chain, new BigNumber(orderAmount).times(rate.nativePerStable))
      : undefined

  return {
    chain: rate.chain,
    stablePerNative: rate.stablePerNative,
    nativePerStable: toDecimalString(rate.nativePerStable),
    expectedNativeAmount,
    fetchedAt: new Date(rate.fetchedAt).toISOString(),
  }
}

export const buildOrderCryptoPrices = async ({
  chains,
  orderAmount,
}: {
  chains: SupportedChain[]
  orderAmount: number | null
}): Promise<OrderCryptoPrice[]> => {
  const effectiveChains = unique(chains)
  const timeoutMs = parseTimeoutMs()
  const rates: ChainPoolRate[] = []

  for (const chain of effectiveChains) {
    const rate = await withTimeout({
      promise: getRateByChain(chain),
      timeoutMs,
      timeoutMessage: `Timed out fetching ${chain} rate after ${timeoutMs}ms.`,
    })

    rates.push(rate)
  }

  return rates.map((rate) => toRateSnapshot(orderAmount, rate))
}

export const getNativeStablePoolRates = async (): Promise<NativeStablePoolRates> => {
  const [ethereum, solana, tron] = await Promise.all([
    getRateByChain('ethereum'),
    getRateByChain('solana'),
    getRateByChain('tron'),
  ])

  return {
    ethereum,
    solana,
    tron,
  }
}
