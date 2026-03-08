import { createThirdwebClient, defineChain } from 'thirdweb'
import { getRpcUrlForChain } from 'thirdweb/chains'
import type { ThirdwebClient } from 'thirdweb'

const getFirstNonEmptyEnv = (names: string[]): string | null => {
  for (const name of names) {
    const value = process.env[name]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return null
}

const getThirdwebClient = (): ThirdwebClient | null => {
  const secretKey = getFirstNonEmptyEnv(['THIRDWEB_SECRET_KEY', 'THIRDWEB_SECRET'])
  const clientId = getFirstNonEmptyEnv(['THIRDWEB_CLIENT_ID', 'NEXT_PUBLIC_THIRDWEB_CLIENT_ID'])

  if (secretKey) {
    return createThirdwebClient({ secretKey })
  }

  if (clientId) {
    return createThirdwebClient({ clientId })
  }

  return null
}

export const getThirdwebRpcUrlForEvmChain = (chainId: number): string | null => {
  const client = getThirdwebClient()
  if (!client) {
    return null
  }

  try {
    return getRpcUrlForChain({
      chain: defineChain(chainId),
      client,
    })
  } catch {
    return null
  }
}
