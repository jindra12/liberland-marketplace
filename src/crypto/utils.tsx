import type { SupportedChain } from './types'

export const normalizeTransactionHash = (chain: SupportedChain, hash: string): string =>
  chain === 'solana' ? hash : hash.toLowerCase()
