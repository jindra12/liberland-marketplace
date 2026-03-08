import BigNumber from 'bignumber.js'
import type { ChainPoolRate, NativeStablePoolRates, OrderCryptoPrice, SupportedChain } from '../types'
import { getEthereumPoolRate } from './ethereum'
import { getSolanaPoolRate } from './solana'
import { getTronPoolRate } from './tron'

const DEFAULT_RATE_FETCH_TIMEOUT_MS = 8_000

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

const withTimeout = async <T>({
  chain,
  promise,
  timeoutMs,
}: {
  chain: SupportedChain
  promise: Promise<T>
  timeoutMs: number
}): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out fetching ${chain} rate after ${timeoutMs}ms.`))
    }, timeoutMs)

    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })

const toRateSnapshot = (orderAmount: number | null, rate: ChainPoolRate): OrderCryptoPrice => {
  const expectedNativeAmount =
    typeof orderAmount === 'number' && Number.isFinite(orderAmount) && orderAmount > 0
      ? toDecimalString(new BigNumber(orderAmount).times(rate.nativePerStable))
      : undefined

  return {
    chain: rate.chain,
    stablePerNative: rate.stablePerNative,
    nativePerStable: toDecimalString(rate.nativePerStable),
    expectedNativeAmount,
    fetchedAt: new Date(rate.fetchedAt).toISOString(),
  }
}

const getRateByChain = async (chain: SupportedChain): Promise<ChainPoolRate> => {
  if (chain === 'ethereum') {
    return getEthereumPoolRate()
  }
  if (chain === 'solana') {
    return getSolanaPoolRate()
  }
  return getTronPoolRate()
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
  const rates = await Promise.all(
    effectiveChains.map((chain) =>
      withTimeout({
        chain,
        promise: getRateByChain(chain),
        timeoutMs,
      }),
    ),
  )

  return rates.map((rate) => toRateSnapshot(orderAmount, rate))
}

export const getNativeStablePoolRates = async (): Promise<NativeStablePoolRates> => {
  const [ethereum, solana, tron] = await Promise.all([
    getEthereumPoolRate(),
    getSolanaPoolRate(),
    getTronPoolRate(),
  ])

  return {
    ethereum,
    solana,
    tron,
  }
}
