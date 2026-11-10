import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockDeep } from 'vitest-mock-extended'
import type { Payload } from 'payload'
import type { ChainPoolRate } from '@/crypto/types'
import { getEthereumPoolRate } from '@/crypto/rates/ethereum'
import {
  __resetCryptoRateCacheForTests,
  buildOrderCryptoPricesFromCache,
  refreshCryptoRateCache,
} from '@/crypto/rates/cache'
import { RATE_OBSERVATION_INTERVAL_MS, RATE_OBSERVATION_WINDOW_MS } from '@/crypto/rates/constants'

vi.mock('@/crypto/rates/ethereum', () => ({ getEthereumPoolRate: vi.fn() }))
vi.mock('@/crypto/rates/solana', () => ({
  getSolanaPoolRate: async () => {
    throw new Error('Unconfigured chain')
  },
}))
vi.mock('@/crypto/rates/tron', () => ({
  getTronPoolRate: async () => {
    throw new Error('Unconfigured chain')
  },
}))

describe('Persisted checkout price observations', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-06T12:00:00Z'))
    await __resetCryptoRateCacheForTests()
    vi.mocked(getEthereumPoolRate).mockImplementation(
      async (): Promise<ChainPoolRate> => ({
        chain: 'ethereum',
        fetchedAt: Date.now(),
        sourceId: 'fixture-pool-config',
        poolAddress: `0x${'11'.repeat(20)}`,
        nativeSymbol: 'ETH',
        stableSymbol: 'USDC',
        stablePerNative: 4000,
        nativePerStable: 1 / 4000,
      }),
    )
  })
  afterEach(() => vi.useRealTimers())

  it('persists a time-spanning observation window and retains it after process-local state resets', async () => {
    const payload = mockDeep<Payload>()
    payload.kv.get.mockResolvedValue(null)
    await Array.from({ length: 7 }).reduce(async (previous, _, index) => {
      await previous
      vi.setSystemTime(
        new Date('2026-11-06T12:00:00Z').getTime() + index * RATE_OBSERVATION_INTERVAL_MS,
      )
      await refreshCryptoRateCache({ payload })
      const write = payload.kv.set.mock.lastCall
      expect(write).toBeDefined()
      payload.kv.get.mockResolvedValue(write![1])
      // Only the durable KV value survives, just as it would across a restart.
      await __resetCryptoRateCacheForTests()
    }, Promise.resolve())
    const quote = await buildOrderCryptoPricesFromCache({
      payload,
      chains: ['ethereum'],
      orderAmount: 40,
    })
    expect(quote).toMatchObject([{ chain: 'ethereum', expectedNativeAmount: '0.01' }])
    expect(getEthereumPoolRate).toHaveBeenCalledTimes(7)
  })

  it('does not make an expired per-chain rate usable by renewing only the cache envelope', async () => {
    const payload = mockDeep<Payload>()
    const rate = await getEthereumPoolRate()
    payload.kv.get.mockResolvedValue({
      cachedAtISO: new Date().toISOString(),
      rates: { ethereum: { ...rate, fetchedAt: Date.now() - RATE_OBSERVATION_WINDOW_MS } },
      observations: {},
    })
    vi.mocked(getEthereumPoolRate).mockRejectedValue(new Error('RPC unavailable'))
    await expect(
      buildOrderCryptoPricesFromCache({ payload, chains: ['ethereum'], orderAmount: 30 }),
    ).rejects.toThrow(/fresh.*rates unavailable/i)
  })
})
