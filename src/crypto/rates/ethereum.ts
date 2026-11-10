import { getContract, readContract } from 'thirdweb'
import { ethereum as ethereumChain } from 'thirdweb/chains'
import { getEthereumRateConfig } from '../env'
import { computePoolRate } from '../math'
import { getRequiredThirdwebClient } from '../thirdweb'
import type { ChainPoolRate } from '../types'
import { assertFreshReserveTimestamp, getRateSourceId } from './utils'

const GET_RESERVES_METHOD =
  'function getReserves() public view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)'

const asAddress = (value: string): `0x${string}` => value as `0x${string}`

const readPairReserves = async ({
  poolAddress,
}: {
  poolAddress: string
}): Promise<readonly [bigint, bigint, number]> => {
  const client = getRequiredThirdwebClient()
  const contract = getContract({
    client,
    chain: ethereumChain,
    address: asAddress(poolAddress),
  })

  const reserves = await readContract({
    contract,
    method: GET_RESERVES_METHOD,
    params: [],
  })

  if (!Array.isArray(reserves) || reserves.length < 2) {
    throw new Error(`Invalid getReserves() response for pool ${poolAddress}.`)
  }

  const reserve0 = reserves[0]
  const reserve1 = reserves[1]
  const blockTimestampLast = reserves.length > 2 ? Number(reserves[2]) : 0

  if (typeof reserve0 !== 'bigint' || typeof reserve1 !== 'bigint') {
    throw new Error(`Invalid reserve types for pool ${poolAddress}.`)
  }

  return [reserve0, reserve1, blockTimestampLast]
}

export const getEthereumPoolRate = async (): Promise<ChainPoolRate> => {
  const config = getEthereumRateConfig()
  const [reserve0, reserve1, timestamp] = await readPairReserves({
    poolAddress: config.poolAddress,
  })
  assertFreshReserveTimestamp(timestamp)

  const nativeFirst =
    config.nativeTokenAddress.toLowerCase() < config.stableTokenAddress.toLowerCase()
  const nativeReserveRaw = nativeFirst ? reserve0 : reserve1
  const stableReserveRaw = nativeFirst ? reserve1 : reserve0

  const rate = computePoolRate({
    nativeReserveRaw,
    nativeDecimals: config.nativeDecimals,
    stableReserveRaw,
    stableDecimals: config.stableDecimals,
  })

  return {
    chain: 'ethereum',
    sourceId: getRateSourceId(config),
    poolAddress: config.poolAddress,
    nativeSymbol: config.nativeSymbol,
    stableSymbol: config.stableSymbol,
    fetchedAt: Date.now(),
    stablePerNative: rate.stablePerNative,
    nativePerStable: rate.nativePerStable,
  }
}
