import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/crypto/thirdweb', () => ({
  getThirdwebRpcUrlForEvmChain: vi.fn(),
}))

import { getThirdwebRpcUrlForEvmChain } from '@/crypto/thirdweb'

const ORIGINAL_ENV = process.env

describe('crypto/env Thirdweb RPC priority', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV }
    delete process.env.CRYPTO_ETH_RPC_URL
    delete process.env.ETH_RPC_URL
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
    vi.clearAllMocks()
  })

  it('uses Thirdweb RPC as primary Ethereum provider when available', async () => {
    process.env.CRYPTO_ETH_RPC_URL = 'https://ethereum-rpc.publicnode.com'

    vi.mocked(getThirdwebRpcUrlForEvmChain).mockReturnValue('https://1.rpc.thirdweb.com/example-key')

    const { getEthereumBaseConfig } = await import('@/crypto/env')
    const config = getEthereumBaseConfig()

    expect(config.rpcUrl).toBe('https://1.rpc.thirdweb.com/example-key')
    expect(config.fallbackRpcUrls).toEqual(['https://ethereum-rpc.publicnode.com'])
  })

  it('falls back to configured ETH RPC when Thirdweb RPC is unavailable', async () => {
    process.env.CRYPTO_ETH_RPC_URL = 'https://ethereum-rpc.publicnode.com'
    vi.mocked(getThirdwebRpcUrlForEvmChain).mockReturnValue(null)

    const { getEthereumBaseConfig } = await import('@/crypto/env')
    const config = getEthereumBaseConfig()

    expect(config.rpcUrl).toBe('https://ethereum-rpc.publicnode.com')
    expect(config.fallbackRpcUrls).toEqual([])
  })
})
