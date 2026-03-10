import { JsonRpcProvider, StaticJsonRpcProvider } from '@ethersproject/providers'
import { getEthereumBaseConfig } from './env'
import { withTimeout } from './timeout'

const DEFAULT_ETH_RPC_TIMEOUT_MS = 60_000
const ETHEREUM_MAINNET = {
  chainId: 1,
  name: 'homestead',
}

const parseAttemptTimeoutMs = (): number => {
  const raw = process.env.CRYPTO_ETH_RPC_TIMEOUT_MS
  if (!raw) {
    return DEFAULT_ETH_RPC_TIMEOUT_MS
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_ETH_RPC_TIMEOUT_MS
  }

  return parsed
}

export const getEthereumRpcUrl = (): string => {
  const base = getEthereumBaseConfig()
  return base.rpcUrl
}

export const withEthereumProvider = async <T>(
  task: (provider: JsonRpcProvider, rpcUrl: string) => Promise<T>,
): Promise<T> => {
  const rpcUrl = getEthereumRpcUrl()
  const timeoutMs = parseAttemptTimeoutMs()
  // Use static network config to avoid runtime detectNetwork() failures on healthy RPCs.
  const provider = new StaticJsonRpcProvider(rpcUrl, ETHEREUM_MAINNET)

  return withTimeout({
    timeoutMs,
    timeoutMessage: `Ethereum RPC call timed out after ${timeoutMs}ms for ${rpcUrl}.`,
    promise: task(provider, rpcUrl),
  })
}
