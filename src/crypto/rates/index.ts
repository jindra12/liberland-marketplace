import type { ChainPoolRate, NativeStablePoolRates, OrderCryptoPrice, SupportedChain } from '../types'
import { getEthereumPoolRate } from './ethereum'
import { getSolanaPoolRate } from './solana'
import { getTronPoolRate } from './tron'

const ALL_CHAINS: SupportedChain[] = ['ethereum', 'solana', 'tron']

const unique = <T>(values: T[]): T[] => [...new Set(values)]

const toRateSnapshot = (orderAmount: number | null, rate: ChainPoolRate): OrderCryptoPrice => {
  const expectedNativeAmount =
    typeof orderAmount === 'number' && Number.isFinite(orderAmount) && orderAmount > 0
      ? orderAmount * rate.nativePerStable
      : undefined

  return {
    chain: rate.chain,
    stablePerNative: rate.stablePerNative,
    nativePerStable: rate.nativePerStable,
    expectedNativeAmount,
    fetchedAt: new Date(rate.fetchedAt).toISOString(),
  }
}

const getRateByChain = async (chain: SupportedChain): Promise<ChainPoolRate> => {
  if (chain === 'ethereum') {
    return getEthereumPoolRate()
  }
  if (chain === 'solana') {
    return getSolanaPoolRate()
  }
  return getTronPoolRate()
}

export const buildOrderCryptoPrices = async ({
  chains,
  orderAmount,
}: {
  chains?: SupportedChain[]
  orderAmount: number | null
}): Promise<OrderCryptoPrice[]> => {
  const effectiveChains = chains && chains.length > 0 ? unique(chains) : ALL_CHAINS
  const rates = await Promise.all(effectiveChains.map((chain) => getRateByChain(chain)))

  return rates.map((rate) => toRateSnapshot(orderAmount, rate))
}

export const getNativeStablePoolRates = async (): Promise<NativeStablePoolRates> => {
  const [ethereum, solana, tron] = await Promise.all([
    getEthereumPoolRate(),
    getSolanaPoolRate(),
    getTronPoolRate(),
  ])

  return {
    ethereum,
    solana,
    tron,
  }
}
