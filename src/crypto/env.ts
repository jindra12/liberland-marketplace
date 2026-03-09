import type { StableTokenSymbol } from './types'
import { getThirdwebRpcUrlForEvmChain } from './thirdweb'

type EthereumBaseConfig = {
  nativeDecimals: number
  nativeSymbol: string
  rpcUrl: string
  stableDecimals: number
  stableSymbol: StableTokenSymbol
}

type EthereumRateConfig = EthereumBaseConfig & {
  nativeTokenAddress: string
  poolAddress: string
  stableTokenAddress: string
}

type SolanaBaseConfig = {
  nativeSymbol: string
  rpcUrl: string
  stableSymbol: StableTokenSymbol
}

type SolanaRateConfig = SolanaBaseConfig & {
  nativeVaultAddress: string
  poolAddress: string
  stableVaultAddress: string
}

type TronBaseConfig = {
  apiUrl: string
  nativeDecimals: number
  nativeSymbol: string
  proApiKey?: string
  stableDecimals: number
  stableSymbol: StableTokenSymbol
}

type TronRateConfig = TronBaseConfig & {
  nativeTokenAddress: string
  poolAddress: string
  stableTokenAddress: string
}

const getEnv = (names: string[], required = false): string | undefined => {
  for (const name of names) {
    const value = process.env[name]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  if (required) {
    throw new Error(`Missing required environment variable. Expected one of: ${names.join(', ')}`)
  }

  return undefined
}

const parseIntEnv = (names: string[], fallback: number): number => {
  const raw = getEnv(names)
  if (!raw) {
    return fallback
  }

  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`Invalid numeric value for ${names.join(' / ')}`)
  }

  return parsed
}

const parseStableTokenSymbol = (names: string[], fallback: StableTokenSymbol): StableTokenSymbol => {
  const raw = getEnv(names)
  if (!raw) {
    return fallback
  }

  const upper = raw.toUpperCase()
  if (upper !== 'USDC' && upper !== 'USDT') {
    throw new Error(`Invalid stable token symbol "${raw}". Allowed values: USDC, USDT`)
  }

  return upper
}

export const getEthereumBaseConfig = (): EthereumBaseConfig => {
  const thirdwebRpcUrl = getThirdwebRpcUrlForEvmChain(1)
  if (!thirdwebRpcUrl) {
    throw new Error(
      'Missing Thirdweb credentials. Configure THIRDWEB_SECRET_KEY / THIRDWEB_SECRET or THIRDWEB_CLIENT_ID.',
    )
  }

  return {
    rpcUrl: thirdwebRpcUrl,
    nativeSymbol: getEnv(['CRYPTO_ETH_NATIVE_TOKEN_SYMBOL'], false) || 'ETH',
    stableSymbol: parseStableTokenSymbol(['CRYPTO_ETH_STABLE_TOKEN_SYMBOL'], 'USDC'),
    nativeDecimals: parseIntEnv(['CRYPTO_ETH_NATIVE_TOKEN_DECIMALS'], 18),
    stableDecimals: parseIntEnv(['CRYPTO_ETH_STABLE_TOKEN_DECIMALS'], 6),
  }
}

export const getEthereumRateConfig = (): EthereumRateConfig => {
  const base = getEthereumBaseConfig()

  return {
    ...base,
    poolAddress: getEnv(['CRYPTO_ETH_POOL_ADDRESS'], true)!,
    nativeTokenAddress: getEnv(['CRYPTO_ETH_NATIVE_TOKEN_ADDRESS'], true)!,
    stableTokenAddress: getEnv(['CRYPTO_ETH_STABLE_TOKEN_ADDRESS'], true)!,
  }
}

export const getSolanaBaseConfig = (): SolanaBaseConfig => {
  return {
    rpcUrl: getEnv(['CRYPTO_SOL_RPC_URL'], true)!,
    nativeSymbol: getEnv(['CRYPTO_SOL_NATIVE_TOKEN_SYMBOL'], false) || 'SOL',
    stableSymbol: parseStableTokenSymbol(['CRYPTO_SOL_STABLE_TOKEN_SYMBOL'], 'USDC'),
  }
}

export const getSolanaRateConfig = (): SolanaRateConfig => {
  const base = getSolanaBaseConfig()

  return {
    ...base,
    poolAddress: getEnv(['CRYPTO_SOL_POOL_ADDRESS'], false) || 'RAYDIUM_VAULT_POOL',
    nativeVaultAddress: getEnv(['CRYPTO_SOL_POOL_NATIVE_VAULT_ADDRESS'], true)!,
    stableVaultAddress: getEnv(['CRYPTO_SOL_POOL_STABLE_VAULT_ADDRESS'], true)!,
  }
}

export const getTronBaseConfig = (): TronBaseConfig => {
  return {
    apiUrl: getEnv(['TRONWEB_API'], true)!,
    proApiKey: getEnv(['TRONWEB_SECRET'], false),
    nativeSymbol: getEnv(['CRYPTO_TRON_NATIVE_TOKEN_SYMBOL'], false) || 'TRX',
    stableSymbol: parseStableTokenSymbol(['CRYPTO_TRON_STABLE_TOKEN_SYMBOL'], 'USDT'),
    nativeDecimals: parseIntEnv(['CRYPTO_TRON_NATIVE_TOKEN_DECIMALS'], 6),
    stableDecimals: parseIntEnv(['CRYPTO_TRON_STABLE_TOKEN_DECIMALS'], 6),
  }
}

export const getTronRateConfig = (): TronRateConfig => {
  const base = getTronBaseConfig()

  return {
    ...base,
    poolAddress: getEnv(['CRYPTO_TRON_POOL_ADDRESS'], true)!,
    nativeTokenAddress: getEnv(['CRYPTO_TRON_NATIVE_TOKEN_ADDRESS'], true)!,
    stableTokenAddress: getEnv(['CRYPTO_TRON_STABLE_TOKEN_ADDRESS'], true)!,
  }
}
