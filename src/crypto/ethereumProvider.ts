import { JsonRpcProvider } from '@ethersproject/providers'
import { getEthereumBaseConfig } from './env'

const toUnique = <T>(values: T[]): T[] => [...new Set(values)]

export const getEthereumRpcUrls = (): string[] => {
  const base = getEthereumBaseConfig()
  return toUnique([base.rpcUrl, ...base.fallbackRpcUrls])
}

export const withEthereumProviderFailover = async <T>(
  task: (provider: JsonRpcProvider, rpcUrl: string) => Promise<T>,
): Promise<T> => {
  const rpcUrls = getEthereumRpcUrls()
  let lastError: unknown

  for (const rpcUrl of rpcUrls) {
    const provider = new JsonRpcProvider(rpcUrl)

    try {
      // Force eager network detection so we can fail over immediately.
      await provider.ready
      return await task(provider, rpcUrl)
    } catch (error) {
      lastError = error
    }
  }

  if (lastError instanceof Error) {
    throw lastError
  }

  throw new Error('Failed to initialize Ethereum JSON-RPC provider.')
}
