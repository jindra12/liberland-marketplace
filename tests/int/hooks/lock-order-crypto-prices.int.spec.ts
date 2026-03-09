import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/crypto/rates/cache', () => ({
  buildOrderCryptoPricesFromCache: vi.fn(),
}))

vi.mock('@/crypto/recipient', () => ({
  resolveProductPaymentTargetsFromItems: vi.fn(),
}))

import { buildOrderCryptoPricesFromCache } from '@/crypto/rates/cache'
import { resolveProductPaymentTargetsFromItems } from '@/crypto/recipient'
import { lockOrderCryptoPricesOnCreate } from '@/hooks/lockOrderCryptoPricesOnCreate'

const createReq = () => ({
  payload: {
    logger: {},
  },
})

describe('lockOrderCryptoPricesOnCreate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('converts order amount from USD base units (cents) before building crypto prices', async () => {
    vi.mocked(resolveProductPaymentTargetsFromItems).mockResolvedValue([
      {
        chain: 'solana',
        normalizedRecipientAddress: 'sol-wallet',
        productID: 'p1',
        quantity: 1,
        recipientAddress: 'sol-wallet',
        stableAmount: 100,
        unitAmount: 100,
      },
    ])

    vi.mocked(buildOrderCryptoPricesFromCache).mockResolvedValue([
      {
        chain: 'solana',
        stablePerNative: 100,
        nativePerStable: '0.01',
        expectedNativeAmount: '1',
        fetchedAt: '2026-03-08T00:00:00.000Z',
      },
    ])

    const req = createReq()
    const result = await lockOrderCryptoPricesOnCreate({
      data: {
        amount: 2_500,
        items: [{ product: 'p1', quantity: 1 }],
      },
      operation: 'create',
      req,
    } as never)

    expect(resolveProductPaymentTargetsFromItems).toHaveBeenCalledTimes(1)
    expect(buildOrderCryptoPricesFromCache).toHaveBeenCalledWith({
      chains: ['solana'],
      orderAmount: 25,
      payload: req.payload,
    })
    expect(result.cryptoPrices).toEqual([
      {
        chain: 'solana',
        stablePerNative: 100,
        nativePerStable: '0.01',
        expectedNativeAmount: '1',
        fetchedAt: '2026-03-08T00:00:00.000Z',
      },
    ])
  })

  it('bubbles up rate-loading errors without wrapping', async () => {
    vi.mocked(resolveProductPaymentTargetsFromItems).mockResolvedValue([
      {
        chain: 'ethereum',
        normalizedRecipientAddress: '0xabc',
        productID: 'p1',
        quantity: 1,
        recipientAddress: '0xabc',
        stableAmount: 100,
        unitAmount: 100,
      },
    ])
    vi.mocked(buildOrderCryptoPricesFromCache).mockRejectedValue(
      new Error('Missing cached crypto rates for ethereum. Please retry in a few seconds.'),
    )

    const req = createReq()

    await expect(
      lockOrderCryptoPricesOnCreate({
        data: {
          amount: 100,
          items: [{ product: 'p1', quantity: 1 }],
        },
        operation: 'create',
        req,
      } as never),
    ).rejects.toThrow('Missing cached crypto rates for ethereum. Please retry in a few seconds.')
  })
})
