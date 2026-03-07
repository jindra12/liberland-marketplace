import { Contract } from '@ethersproject/contracts'
import { JsonRpcProvider } from '@ethersproject/providers'
import { normalizeEthereumAddress } from '../ethereum'
import { getEthereumRateConfig } from '../env'
import { computePoolRate } from '../math'
import type { ChainPoolRate } from '../types'

const UNISWAP_V2_PAIR_ABI = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
]

const toBigInt = (value: unknown): bigint => BigInt(String(value))

export const getEthereumPoolRate = async (): Promise<ChainPoolRate> => {
  const config = getEthereumRateConfig()
  const provider = new JsonRpcProvider(config.rpcUrl)

  const pair = new Contract(config.poolAddress, UNISWAP_V2_PAIR_ABI, provider)
  const [token0, token1, reserves] = await Promise.all([
    pair.token0() as Promise<string>,
    pair.token1() as Promise<string>,
    pair.getReserves() as Promise<{ reserve0: unknown; reserve1: unknown }>,
  ])

  const normalizedNative = normalizeEthereumAddress(config.nativeTokenAddress)
  const normalizedStable = normalizeEthereumAddress(config.stableTokenAddress)
  const normalizedToken0 = normalizeEthereumAddress(token0)
  const normalizedToken1 = normalizeEthereumAddress(token1)

  let nativeReserveRaw: bigint
  let stableReserveRaw: bigint

  if (normalizedToken0 === normalizedNative && normalizedToken1 === normalizedStable) {
    nativeReserveRaw = toBigInt(reserves.reserve0)
    stableReserveRaw = toBigInt(reserves.reserve1)
  } else if (normalizedToken0 === normalizedStable && normalizedToken1 === normalizedNative) {
    nativeReserveRaw = toBigInt(reserves.reserve1)
    stableReserveRaw = toBigInt(reserves.reserve0)
  } else {
    throw new Error(
      `Configured ETH pool does not match configured native/stable tokens. token0=${token0}, token1=${token1}`,
    )
  }

  const rate = computePoolRate({
    nativeReserveRaw,
    nativeDecimals: config.nativeDecimals,
    stableReserveRaw,
    stableDecimals: config.stableDecimals,
  })

  return {
    chain: 'ethereum',
    poolAddress: config.poolAddress,
    nativeSymbol: config.nativeSymbol,
    stableSymbol: config.stableSymbol,
    fetchedAt: Date.now(),
    stablePerNative: rate.stablePerNative,
    nativePerStable: rate.nativePerStable,
  }
}
