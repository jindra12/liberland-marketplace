import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/crypto/env', () => ({
  getEthereumRateConfig: vi.fn(),
}))

vi.mock('@/crypto/thirdweb', () => ({
  getRequiredThirdwebClient: vi.fn(),
}))

vi.mock('thirdweb', () => ({
  getContract: vi.fn(),
  readContract: vi.fn(),
}))

vi.mock('thirdweb/chains', () => ({
  ethereum: { id: 1 },
}))

import { getEthereumRateConfig } from '@/crypto/env'
import { getRequiredThirdwebClient } from '@/crypto/thirdweb'
import { getEthereumPoolRate } from '@/crypto/rates/ethereum'
import { getContract, readContract } from 'thirdweb'

describe('crypto/rates/ethereum', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(getEthereumRateConfig).mockReturnValue({
      rpcUrl: 'https://1.rpc.thirdweb.com/test-key',
      poolAddress: '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc',
      nativeTokenAddress: '0xC02AAa39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      stableTokenAddress: '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      nativeSymbol: 'ETH',
      stableSymbol: 'USDC',
      nativeDecimals: 18,
      stableDecimals: 6,
    })
    vi.mocked(getRequiredThirdwebClient).mockReturnValue({} as never)
    vi.mocked(getContract).mockReturnValue({} as never)
    vi.mocked(readContract).mockResolvedValue([1_000_000_000_000n, 5_000_000_000_000_000_000_000n, 123] as never)
  })

  it('uses thirdweb readContract getReserves and returns a valid pool rate', async () => {
    const rate = await getEthereumPoolRate()

    expect(vi.mocked(getRequiredThirdwebClient)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(getContract)).toHaveBeenCalledTimes(1)
    const readContractCall = vi.mocked(readContract).mock.calls[0]?.[0]
    expect(readContractCall).toBeDefined()
    expect(readContractCall?.params).toEqual([])
    expect(String(readContractCall?.method)).toContain('getReserves')

    expect(rate.chain).toBe('ethereum')
    expect(rate.poolAddress).toBe('0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc')
    expect(rate.stablePerNative).toBeGreaterThan(0)
    expect(rate.nativePerStable).toBeGreaterThan(0)
  })
})
