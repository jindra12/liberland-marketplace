import { describe, expect, it } from 'vitest'
import { getEthereumBaseConfig } from '@/crypto/env'

const hasThirdwebCredentials =
  Boolean(process.env.THIRDWEB_SECRET_KEY) ||
  Boolean(process.env.THIRDWEB_SECRET) ||
  Boolean(process.env.THIRDWEB_CLIENT_ID) ||
  Boolean(process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID)

describe('crypto/env Thirdweb live selection', () => {
  it.skipIf(!hasThirdwebCredentials)(
    'selects Thirdweb RPC for Ethereum when credentials are configured',
    () => {
      const config = getEthereumBaseConfig()

      expect(config.rpcUrl).toContain('.rpc.thirdweb.com')
    },
  )
})
