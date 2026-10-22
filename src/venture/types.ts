export type IndexedPool = {
  id: string
  key: { currency0: string; currency1: string; fee: number; tickSpacing: number; hooks: string }
  currency0: { address: string; symbol: string; decimals: number }
  currency1: { address: string; symbol: string; decimals: number }
}
export type IndexedProposal = {
  id: string
  proposer: string
  description: string
  targets: string[]
  values: string[]
  calldatas: string[]
}
export type VentureIndexSnapshot = {
  pools: IndexedPool[]
  proposals: IndexedProposal[]
  lastBlock: number
  blockHash: string
  hasMore: boolean
}
