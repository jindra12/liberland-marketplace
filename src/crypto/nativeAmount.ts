import BigNumber from 'bignumber.js'
import type { SupportedChain } from './types'

const CHAIN_NATIVE_DECIMALS: Record<SupportedChain, number> = {
  ethereum: 18,
  solana: 9,
  tron: 6,
}

export const getChainNativeDecimals = (chain: SupportedChain): number => CHAIN_NATIVE_DECIMALS[chain]

export const quantizeNativeAmount = (chain: SupportedChain, amount: BigNumber.Value): string => {
  const decimals = getChainNativeDecimals(chain)
  return new BigNumber(amount).decimalPlaces(decimals, BigNumber.ROUND_DOWN).toFixed()
}
