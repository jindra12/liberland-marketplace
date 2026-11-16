export type PaymentNotification = {
  version: 1
  id: string
  type: 'payment.completed'
  createdAt: string
  serverUrl: string
  sessionId: string
  companyId: string
  productId: string | null
  quantity: number
  externalReference: string | null
  kind: 'donation' | 'product'
  requestedAmountUsdCents: number
  settlement: {
    receiver: string
    chainId: number
    tokenAddress: string
    tokenSymbol: string
    amount: string
    decimals: number
  }
  verification: {
    provider: 'thirdweb'
    verifiedAt: string
    signatureVerified: true
    completed: true
    receiverMatched: true
    chainMatched: true
    tokenMatched: true
    amountSatisfied: true
  }
  thirdweb: {
    paymentId: string
    rawBody: string
    signatureHeaders: Record<string, string>
    transactions: Array<{ chainId: number; transactionHash: string }>
  }
}
