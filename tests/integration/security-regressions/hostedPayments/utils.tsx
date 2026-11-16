import { createLocalReq } from 'payload'
import type { Payload } from 'payload'
import { CHECKOUT_SETTLEMENT } from '@/payments/constants'
import { signPaymentBody } from '@/payments/utils'

export const providerEvent = (sessionId: string, receiver: string) => ({
  version: 2,
  type: 'pay.onchain-transaction',
  data: {
    action: 'TRANSFER',
    clientId: 'test-project',
    paymentId: `payment-${sessionId}`,
    destinationAmount: '10000000',
    originAmount: '10000000',
    destinationToken: {
      address: String(CHECKOUT_SETTLEMENT.tokenAddress),
      chainId: 8453,
      decimals: 6,
      name: 'USD Coin',
      symbol: 'USDC',
      priceUsd: 1,
    },
    originToken: {
      address: CHECKOUT_SETTLEMENT.tokenAddress,
      chainId: 8453,
      decimals: 6,
      name: 'USD Coin',
      symbol: 'USDC',
      priceUsd: 1,
    },
    developerFeeBps: 0,
    developerFeeRecipient: receiver,
    receiver,
    sender: `0x${'2'.repeat(40)}`,
    status: 'COMPLETED',
    transactions: [{ chainId: 8453, transactionHash: `0x${'a'.repeat(64)}` }],
    purchaseData: { nswapSessionId: sessionId },
    type: 'transfer',
  },
})

export const providerRequest = async (
  payload: Payload,
  event: ReturnType<typeof providerEvent>,
  timestamp = String(Math.floor(Date.now() / 1000)),
) => {
  const req = await createLocalReq({}, payload)
  const body = JSON.stringify(event)
  req.headers = new Headers({
    'x-pay-timestamp': timestamp,
    'x-pay-signature': signPaymentBody('test-provider-secret', timestamp, body),
  })
  return { req, body }
}
