import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChainPoolRate } from '@/crypto/types'

vi.mock('@/crypto/rates/ethereum', () => ({
  getEthereumPoolRate: vi.fn(),
}))

vi.mock('@/crypto/rates/solana', () => ({
  getSolanaPoolRate: vi.fn(),
}))

vi.mock('@/crypto/rates/tron', () => ({
  getTronPoolRate: vi.fn(),
}))

import { getEthereumPoolRate } from '@/crypto/rates/ethereum'
import { getSolanaPoolRate } from '@/crypto/rates/solana'
import { getTronPoolRate } from '@/crypto/rates/tron'
import {
  __resetCryptoRateCacheForTests,
  buildOrderCryptoPricesFromCache,
  refreshCryptoRateCache,
} from '@/crypto/rates/cache'

const ETH_RATE: ChainPoolRate = {
  chain: 'ethereum',
  fetchedAt: 1_700_000_000_000,
  nativePerStable: 0.0004,
  nativeSymbol: 'ETH',
  poolAddress: '0xpool-eth',
  stablePerNative: 2500,
  stableSymbol: 'USDC',
}

const SOL_RATE: ChainPoolRate = {
  chain: 'solana',
  fetchedAt: 1_700_000_000_100,
  nativePerStable: 0.01,
  nativeSymbol: 'SOL',
  poolAddress: 'pool-sol',
  stablePerNative: 100,
  stableSymbol: 'USDC',
}

const TRON_RATE: ChainPoolRate = {
  chain: 'tron',
  fetchedAt: 1_700_000_000_200,
  nativePerStable: 4,
  nativeSymbol: 'TRX',
  poolAddress: 'pool-tron',
  stablePerNative: 0.25,
  stableSymbol: 'USDT',
}

type KvLike = {
  delete: (key: string) => Promise<void>
  get: <T>(key: string) => Promise<null | T>
  set: (key: string, value: unknown) => Promise<void>
}

const createFakePayload = () => {
  const store = new Map<string, unknown>()
  const kv: KvLike = {
    delete: async (key) => {
      store.delete(key)
    },
    get: async <T>(key: string) => {
      return (store.get(key) as T | undefined) ?? null
    },
    set: async (key, value) => {
      store.set(key, value)
    },
  }

  return {
    kv,
    logger: {
      error: vi.fn(),
      info: vi.fn(),
    },
  }
}

describe('crypto rate cache', () => {
  const previousCacheMaxAge = process.env.CRYPTO_RATE_CACHE_MAX_AGE_MS
  let payload = createFakePayload()

  beforeEach(async () => {
    payload = createFakePayload()
    process.env.CRYPTO_RATE_CACHE_MAX_AGE_MS = '600000'
    await __resetCryptoRateCacheForTests({ payload: payload as never })
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await __resetCryptoRateCacheForTests({ payload: payload as never })
    if (previousCacheMaxAge === undefined) {
      delete process.env.CRYPTO_RATE_CACHE_MAX_AGE_MS
    } else {
      process.env.CRYPTO_RATE_CACHE_MAX_AGE_MS = previousCacheMaxAge
    }
  })

  it('refreshes cache via payload.kv and builds order prices from cached snapshots', async () => {
    vi.mocked(getEthereumPoolRate).mockResolvedValue(ETH_RATE)
    vi.mocked(getSolanaPoolRate).mockResolvedValue(SOL_RATE)
    vi.mocked(getTronPoolRate).mockResolvedValue(TRON_RATE)

    await refreshCryptoRateCache({ payload: payload as never })

    const prices = await buildOrderCryptoPricesFromCache({
      chains: ['ethereum', 'solana'],
      orderAmount: 25,
      payload: payload as never,
    })

    expect(prices).toEqual([
      {
        chain: 'ethereum',
        stablePerNative: 2500,
        nativePerStable: '0.0004',
        expectedNativeAmount: '0.01',
        fetchedAt: new Date(ETH_RATE.fetchedAt).toISOString(),
      },
      {
        chain: 'solana',
        stablePerNative: 100,
        nativePerStable: '0.01',
        expectedNativeAmount: '0.25',
        fetchedAt: new Date(SOL_RATE.fetchedAt).toISOString(),
      },
    ])
  })

  it('throws when cache does not have required chain rates yet', async () => {
    await expect(
      buildOrderCryptoPricesFromCache({
        chains: ['ethereum'],
        orderAmount: 10,
        payload: payload as never,
      }),
    ).rejects.toThrow('Crypto rate cache is empty. Please retry in a few seconds.')
  })

  it('keeps healthy chains cached when one chain refresh fails', async () => {
    vi.mocked(getEthereumPoolRate).mockRejectedValue(new Error('eth down'))
    vi.mocked(getSolanaPoolRate).mockResolvedValue(SOL_RATE)
    vi.mocked(getTronPoolRate).mockResolvedValue(TRON_RATE)

    await refreshCryptoRateCache({ payload: payload as never })

    const prices = await buildOrderCryptoPricesFromCache({
      chains: ['solana', 'tron'],
      orderAmount: 50,
      payload: payload as never,
    })

    expect(prices).toHaveLength(2)
    expect(payload.logger.error).toHaveBeenCalledTimes(1)
  })
})
