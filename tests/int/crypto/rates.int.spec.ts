import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChainPoolRate } from '@/crypto/types'

/**
 * We mock chain-specific rate readers so this suite stays deterministic.
 *
 * The goal here is to test OUR orchestration logic in src/crypto/rates/index.ts:
 * - selecting chains
 * - deduplicating chain requests
 * - mapping pool rates into order snapshots
 * - computing expected native amount from order amount
 */
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
import { buildOrderCryptoPrices, getNativeStablePoolRates } from '@/crypto/rates'

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

describe('crypto/rates integration (mocked chain providers)', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(getEthereumPoolRate).mockResolvedValue(ETH_RATE)
    vi.mocked(getSolanaPoolRate).mockResolvedValue(SOL_RATE)
    vi.mocked(getTronPoolRate).mockResolvedValue(TRON_RATE)
  })

  it('builds order prices only for requested chains and deduplicates chain list', async () => {
    const prices = await buildOrderCryptoPrices({
      chains: ['ethereum', 'ethereum', 'tron'],
      orderAmount: 500,
    })

    expect(vi.mocked(getEthereumPoolRate)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(getSolanaPoolRate)).toHaveBeenCalledTimes(0)
    expect(vi.mocked(getTronPoolRate)).toHaveBeenCalledTimes(1)

    expect(prices).toHaveLength(2)

    const eth = prices.find((entry) => entry.chain === 'ethereum')
    const tron = prices.find((entry) => entry.chain === 'tron')

    expect(eth).toBeDefined()
    expect(tron).toBeDefined()

    // 500 stable * 0.0004 ETH/stable = 0.2 ETH expected.
    expect(eth?.expectedNativeAmount).toBe('0.2')

    // 500 stable * 4 TRX/stable = 2000 TRX expected.
    expect(tron?.expectedNativeAmount).toBe('2000')

    // Fetched timestamp is converted to ISO string in snapshots.
    expect(eth?.fetchedAt).toBe(new Date(ETH_RATE.fetchedAt).toISOString())
  })

  it('falls back to all chains when no chain filter is supplied', async () => {
    const prices = await buildOrderCryptoPrices({
      orderAmount: 100,
    })

    expect(prices).toHaveLength(3)
    expect(vi.mocked(getEthereumPoolRate)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(getSolanaPoolRate)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(getTronPoolRate)).toHaveBeenCalledTimes(1)
  })

  it('returns raw pool rates grouped by chain for dashboard-like consumers', async () => {
    const rates = await getNativeStablePoolRates()

    expect(rates).toEqual({
      ethereum: ETH_RATE,
      solana: SOL_RATE,
      tron: TRON_RATE,
    })
  })
})
