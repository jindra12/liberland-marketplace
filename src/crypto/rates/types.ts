import type { ChainPoolRate, SupportedChain } from '../types'

export type CryptoRatesCacheValue = {
  cachedAtISO: string
  rates: Partial<Record<SupportedChain, ChainPoolRate>>
  observations: Partial<Record<SupportedChain, ChainPoolRate[]>>
}
