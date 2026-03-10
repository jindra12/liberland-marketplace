export type SupportedChain = 'ethereum' | 'solana' | 'tron'

export type StableTokenSymbol = 'USDC' | 'USDT'

export type ChainPoolRate = {
  chain: SupportedChain
  fetchedAt: number
  nativePerStable: number
  nativeSymbol: string
  poolAddress: string
  stablePerNative: number
  stableSymbol: StableTokenSymbol
}

export type NativeStablePoolRates = {
  ethereum: ChainPoolRate
  solana: ChainPoolRate
  tron: ChainPoolRate
}

export type VerifySolanaPayTransactionInput = {
  chain: 'solana'
  expectedAmount: number | string
  minTimestampMs: number
  orderId: string
  recipientAddress: string
  transactionHash: string
}

export type VerifyNativeTransferTransactionInput = {
  chain: 'ethereum' | 'tron'
  expectedAmount: number | string
  minTimestampMs: number
  orderIdToExclude?: string
  recipientAddress: string
  transactionHash: string
}

export type VerifyTransactionInput =
  | VerifyNativeTransferTransactionInput
  | VerifySolanaPayTransactionInput

export type VerifyTransactionResult = {
  chain: SupportedChain
  error?: string
  observedTimestampMs?: number
  ok: boolean
  productIDs?: string[]
  recipientAddress?: string
  transactionHash?: string
}

export type OrderCryptoPrice = {
  chain: SupportedChain
  expectedNativeAmount?: string | null
  fetchedAt: string
  nativePerStable: string
  stablePerNative: number
}

export type VerifyOrderPaymentResult = {
  error?: string
  ok: boolean
  orderId: string
  results: VerifyTransactionResult[]
}
