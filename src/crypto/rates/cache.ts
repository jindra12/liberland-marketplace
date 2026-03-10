import BigNumber from 'bignumber.js'
import type { Payload } from 'payload'
import type { ChainPoolRate, OrderCryptoPrice, SupportedChain } from '../types'
import { quantizeNativeAmount } from '../nativeAmount'
import { withTimeout } from '../timeout'
import { getEthereumPoolRate } from './ethereum'
import { getSolanaPoolRate } from './solana'
import { getTronPoolRate } from './tron'

const DEFAULT_REFRESH_INTERVAL_MS = 5 * 60 * 1000
const DEFAULT_RATE_FETCH_TIMEOUT_MS = 60_000
const DEFAULT_CACHE_MAX_AGE_MS = 15 * 60 * 1000
const CRYPTO_RATE_CACHE_KEY = 'crypto:pool-rates:v1'

type CryptoRatesCacheValue = {
  cachedAtISO: string
  rates: Partial<Record<SupportedChain, ChainPoolRate>>
}

let schedulerStarted = false
let refreshIntervalHandle: ReturnType<typeof setInterval> | null = null
let inFlightRefresh: Promise<void> | null = null

const unique = <T>(values: T[]): T[] => [...new Set(values)]
const toDecimalString = (value: BigNumber.Value): string => new BigNumber(value).toFixed()

const parseRefreshIntervalMs = (): number => {
  const raw = process.env.CRYPTO_RATE_REFRESH_INTERVAL_MS
  if (!raw) {
    return DEFAULT_REFRESH_INTERVAL_MS
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_REFRESH_INTERVAL_MS
  }

  return parsed
}

const parseRateFetchTimeoutMs = (): number => {
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

const parseCacheMaxAgeMs = (): number => {
  const raw = process.env.CRYPTO_RATE_CACHE_MAX_AGE_MS
  if (!raw) {
    return DEFAULT_CACHE_MAX_AGE_MS
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CACHE_MAX_AGE_MS
  }

  return parsed
}

const readCacheValue = async ({
  payload,
}: {
  payload: Pick<Payload, 'kv'>
}): Promise<CryptoRatesCacheValue | null> => {
  const value = await payload.kv.get<CryptoRatesCacheValue>(CRYPTO_RATE_CACHE_KEY)
  if (!value || typeof value !== 'object') {
    return null
  }

  if (!value.cachedAtISO || !value.rates) {
    return null
  }

  return value
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

export const refreshCryptoRateCache = async ({
  payload,
}: {
  payload: Pick<Payload, 'kv' | 'logger'>
}): Promise<void> => {
  if (inFlightRefresh) {
    return inFlightRefresh
  }

  inFlightRefresh = (async () => {
    const timeoutMs = parseRateFetchTimeoutMs()
    const existing = await readCacheValue({ payload })
    const mergedRates: Partial<Record<SupportedChain, ChainPoolRate>> = { ...(existing?.rates ?? {}) }

    const [ethereum, solana, tron] = await Promise.allSettled([
      withTimeout({
        promise: getEthereumPoolRate(),
        timeoutMs,
        timeoutMessage: `Timed out fetching ethereum rate after ${timeoutMs}ms.`,
      }),
      withTimeout({
        promise: getSolanaPoolRate(),
        timeoutMs,
        timeoutMessage: `Timed out fetching solana rate after ${timeoutMs}ms.`,
      }),
      withTimeout({
        promise: getTronPoolRate(),
        timeoutMs,
        timeoutMessage: `Timed out fetching tron rate after ${timeoutMs}ms.`,
      }),
    ])

    if (ethereum.status === 'fulfilled') {
      mergedRates.ethereum = ethereum.value
    } else {
      payload.logger.error(`[crypto-rate-cache] Failed refreshing ethereum rate: ${String(ethereum.reason)}`)
    }

    if (solana.status === 'fulfilled') {
      mergedRates.solana = solana.value
    } else {
      payload.logger.error(`[crypto-rate-cache] Failed refreshing solana rate: ${String(solana.reason)}`)
    }

    if (tron.status === 'fulfilled') {
      mergedRates.tron = tron.value
    } else {
      payload.logger.error(`[crypto-rate-cache] Failed refreshing tron rate: ${String(tron.reason)}`)
    }

    await payload.kv.set(CRYPTO_RATE_CACHE_KEY, {
      cachedAtISO: new Date().toISOString(),
      rates: mergedRates,
    } satisfies CryptoRatesCacheValue)
  })()

  try {
    await inFlightRefresh
  } finally {
    inFlightRefresh = null
  }
}

export const buildOrderCryptoPricesFromCache = async ({
  chains,
  orderAmount,
  payload,
}: {
  chains: SupportedChain[]
  orderAmount: number | null
  payload: Pick<Payload, 'kv'>
}): Promise<OrderCryptoPrice[]> => {
  const effectiveChains = unique(chains)
  const cacheValue = await readCacheValue({ payload })
  if (!cacheValue) {
    throw new Error('Crypto rate cache is empty. Please retry in a few seconds.')
  }

  const maxAgeMs = parseCacheMaxAgeMs()
  const cachedAt = new Date(cacheValue.cachedAtISO).getTime()
  if (!Number.isFinite(cachedAt) || Date.now() - cachedAt > maxAgeMs) {
    throw new Error('Crypto rate cache is stale. Please retry in a few seconds.')
  }

  const missingChains = effectiveChains.filter((chain) => !cacheValue.rates[chain])
  if (missingChains.length > 0) {
    throw new Error(
      `Missing cached crypto rates for ${missingChains.join(', ')}. Please retry in a few seconds.`,
    )
  }

  return effectiveChains.map((chain) => toRateSnapshot(orderAmount, cacheValue.rates[chain]!))
}

export const startCryptoRateRefreshScheduler = async ({
  payload,
}: {
  payload: Pick<Payload, 'kv' | 'logger'>
}): Promise<void> => {
  if (schedulerStarted) {
    return
  }

  schedulerStarted = true
  const intervalMs = parseRefreshIntervalMs()
  await refreshCryptoRateCache({ payload })

  refreshIntervalHandle = setInterval(() => {
    void refreshCryptoRateCache({ payload })
  }, intervalMs)

  if (
    typeof refreshIntervalHandle === 'object' &&
    refreshIntervalHandle !== null &&
    'unref' in refreshIntervalHandle &&
    typeof refreshIntervalHandle.unref === 'function'
  ) {
    refreshIntervalHandle.unref()
  }

  payload.logger.info(`[crypto-rate-cache] Started rate refresh scheduler (interval=${intervalMs}ms).`)
}

export const __resetCryptoRateCacheForTests = async ({
  payload,
}: {
  payload?: Pick<Payload, 'kv'>
} = {}): Promise<void> => {
  if (refreshIntervalHandle) {
    clearInterval(refreshIntervalHandle)
  }

  schedulerStarted = false
  refreshIntervalHandle = null
  inFlightRefresh = null

  if (payload) {
    await payload.kv.delete(CRYPTO_RATE_CACHE_KEY)
  }
}
