import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/crypto/thirdweb', () => ({
  getThirdwebRpcUrlForEvmChain: vi.fn(),
}))

import { getThirdwebRpcUrlForEvmChain } from '@/crypto/thirdweb'

const ORIGINAL_ENV = process.env

describe('crypto/env Thirdweb RPC selection', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV }
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
    vi.clearAllMocks()
  })

  it('uses Thirdweb RPC as the Ethereum provider', async () => {
    vi.mocked(getThirdwebRpcUrlForEvmChain).mockReturnValue('https://1.rpc.thirdweb.com/example-key')

    const { getEthereumBaseConfig } = await import('@/crypto/env')
    const config = getEthereumBaseConfig()

    expect(config.rpcUrl).toBe('https://1.rpc.thirdweb.com/example-key')
  })

  it('throws when Thirdweb RPC cannot be resolved from credentials', async () => {
    vi.mocked(getThirdwebRpcUrlForEvmChain).mockReturnValue(null)

    const { getEthereumBaseConfig } = await import('@/crypto/env')
    expect(() => getEthereumBaseConfig()).toThrow('Missing Thirdweb credentials.')
  })
})
