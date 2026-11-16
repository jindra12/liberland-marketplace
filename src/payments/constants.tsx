/** USD-priced hosted checkout settles in USDC on Base; payer routes are provided by Thirdweb. */
export const CHECKOUT_SETTLEMENT = {
  chainId: 8453,
  tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  decimals: 6,
  symbol: 'USDC',
} as const

export const PAYMENT_SIGNATURE_TOLERANCE_SECONDS = 300
