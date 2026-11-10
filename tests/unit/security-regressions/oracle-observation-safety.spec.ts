import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readContract } from 'thirdweb'
import { getEthereumRateConfig } from '@/crypto/env'
import { getEthereumPoolRate } from '@/crypto/rates/ethereum'
import { observePoolRate } from '@/crypto/rates/utils'
import { RATE_OBSERVATION_INTERVAL_MS, RATE_OBSERVATION_WINDOW_MS } from '@/crypto/rates/constants'

vi.mock('thirdweb', () => ({ getContract: vi.fn(), readContract: vi.fn() }))
vi.mock('@/crypto/thirdweb', () => ({ getRequiredThirdwebClient: vi.fn() }))
vi.mock('@/crypto/env', () => ({ getEthereumRateConfig: vi.fn() }))

describe('Exchange-rate oracle observation safety', () => {
  beforeEach(() => {
    vi.mocked(getEthereumRateConfig).mockReturnValue({
      poolAddress: `0x${'33'.repeat(20)}`,
      nativeTokenAddress: `0x${'11'.repeat(20)}`,
      stableTokenAddress: `0x${'22'.repeat(20)}`,
      nativeDecimals: 18,
      stableDecimals: 6,
      nativeSymbol: 'ETH',
      stableSymbol: 'USDC',
      rpcUrl: 'https://rpc.example',
    })
  })
  it('does not label an ancient single-pool reserve observation as a newly fetched usable price', async () => {
    vi.mocked(readContract).mockResolvedValue([1000000000000000000n, 3000000000n, 1])
    await expect(getEthereumPoolRate()).rejects.toThrow(/stale|observation|oracle|fresh|timestamp/i)
  })

  it('does not immediately adopt an uncorroborated hundredfold spot-price change', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    vi.mocked(readContract)
      .mockResolvedValueOnce([1000000000000000000n, 3000000000n, timestamp])
      .mockResolvedValue([1000000000000000000n, 300000000000n, timestamp])
    const before = await getEthereumPoolRate()
    const history = Array.from({ length: 7 }, (_, index) => ({
      ...before,
      fetchedAt:
        before.fetchedAt - RATE_OBSERVATION_WINDOW_MS + index * RATE_OBSERVATION_INTERVAL_MS,
    }))
    expect(observePoolRate(before, history).rate?.stablePerNative).toBe(before.stablePerNative)
    const after = await getEthereumPoolRate()
    const outcome = observePoolRate(after, history)
    expect(outcome.rate).toBeNull()
    expect(outcome.observations).toEqual(history)
  })

  it('requires elapsed time rather than repeated requests to warm up a pool', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    vi.mocked(readContract).mockResolvedValue([1000000000000000000n, 3000000000n, timestamp])
    const rate = await getEthereumPoolRate()
    const first = observePoolRate(rate, [])
    expect(first.rate).toBeNull()
    const repeated = observePoolRate(rate, first.observations)
    expect(repeated.rate).toBeNull()
    expect(repeated.observations).toHaveLength(1)
  })

  it('starts a new warm-up after a source change or a long sampling outage', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    vi.mocked(readContract).mockResolvedValue([1000000000000000000n, 3000000000n, timestamp])
    const rate = await getEthereumPoolRate()
    const history = Array.from({ length: 7 }, (_, index) => ({
      ...rate,
      fetchedAt: rate.fetchedAt - RATE_OBSERVATION_WINDOW_MS + index * RATE_OBSERVATION_INTERVAL_MS,
    }))
    expect(observePoolRate({ ...rate, sourceId: 'different-config' }, history).rate).toBeNull()
    expect(
      observePoolRate(
        rate,
        history.map((sample) => ({
          ...sample,
          fetchedAt: sample.fetchedAt - RATE_OBSERVATION_WINDOW_MS,
        })),
      ).rate,
    ).toBeNull()
  })
})
