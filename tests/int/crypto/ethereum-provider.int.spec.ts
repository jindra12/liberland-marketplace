import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const constructedProviderUrls: string[] = []

vi.mock('@ethersproject/providers', () => ({
  JsonRpcProvider: class JsonRpcProvider {},
  StaticJsonRpcProvider: class StaticJsonRpcProvider {
    constructor(url: string) {
      constructedProviderUrls.push(url)
    }
  },
}))

vi.mock('@/crypto/thirdweb', () => ({
  getThirdwebRpcUrlForEvmChain: vi.fn(() => 'https://1.rpc.thirdweb.com/test-key'),
}))

const ORIGINAL_ENV = process.env

describe('crypto/ethereumProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    constructedProviderUrls.length = 0
    process.env = { ...ORIGINAL_ENV }

    delete process.env.THIRDWEB_SECRET
    delete process.env.THIRDWEB_SECRET_KEY
    delete process.env.THIRDWEB_CLIENT_ID
    delete process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('instantiates a static provider and executes the task directly', async () => {
    process.env.CRYPTO_ETH_RPC_TIMEOUT_MS = '50'
    const rpcUrl = 'https://1.rpc.thirdweb.com/test-key'

    const { withEthereumProvider } = await import('@/crypto/ethereumProvider')
    const result = await withEthereumProvider(async (_provider, usedRpcUrl) => `ok:${usedRpcUrl}`)

    expect(result).toBe(`ok:${rpcUrl}`)
    expect(constructedProviderUrls).toEqual([rpcUrl])
  })

  it('times out when the RPC task itself does not resolve', async () => {
    process.env.CRYPTO_ETH_RPC_TIMEOUT_MS = '50'
    const rpcUrl = 'https://1.rpc.thirdweb.com/test-key'

    const { withEthereumProvider } = await import('@/crypto/ethereumProvider')

    await expect(
      withEthereumProvider(async () => new Promise<string>(() => {})),
    ).rejects.toThrow(`Ethereum RPC call timed out after 50ms for ${rpcUrl}.`)
  })
})
