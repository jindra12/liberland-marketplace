import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'
import type { Payload, PayloadRequest, CollectionBeforeChangeHook } from 'payload'
import type { Product } from '@/payload-types'
import { lockOrderCryptoPricesOnCreate } from '@/hooks/lockOrderCryptoPricesOnCreate'
import type { OrderWithPaymentProofs } from '@/crypto/order'
import { getPayloadInstance } from '@/crypto/payload'
import { verifyTransactionOccurred } from '@/crypto/verification'
import { verifyEthereumNativeTransfer } from '@/crypto/verification/ethereum'

vi.mock('@/crypto/payload', () => ({ getPayloadInstance: vi.fn() }))
// Mock chain I/O only: the real order reader, grouping, and price selection run.
vi.mock('@/crypto/verification/ethereum', () => ({ verifyEthereumNativeTransfer: vi.fn() }))

describe('Order payment verification boundaries', () => {
  beforeEach(() => {
    vi.mocked(verifyEthereumNativeTransfer).mockReset()
    vi.mocked(verifyEthereumNativeTransfer).mockImplementation(async (input) => ({
      chain: 'ethereum',
      transactionHash: input.transactionHash,
      observedTimestampMs: Date.now(),
      ok: Number(input.expectedAmount) === 0.01,
    }))
  })

  it.each([1, 3, 7])(
    'verifies exactly the native amount originally locked for quantity %s',
    async (quantity) => {
      const req = mockDeep<PayloadRequest>()
      const address = `0x${'11'.repeat(20)}`
      const nativePerStable = 1 / 3123.77
      const now = new Date().toISOString()
      req.payload.kv.get.mockResolvedValue({
        cachedAtISO: now,
        rates: {
          ethereum: {
            chain: 'ethereum',
            fetchedAt: Date.now(),
            nativePerStable,
            stablePerNative: 3123.77,
            nativeSymbol: 'ETH',
            stableSymbol: 'USDC',
            poolAddress: address,
          },
        },
      })
      req.payload.findByID.mockResolvedValue(
        mock<Product>({
          id: 'product',
          priceInUSD: 1999,
          cryptoAddresses: { chain: 'ethereum', address },
          orderable: true,
        }),
      )
      const locked = await lockOrderCryptoPricesOnCreate(
        Object.assign(mock<Parameters<CollectionBeforeChangeHook>[0]>(), {
          req,
          operation: 'create',
          data: { amount: 1999 * quantity, items: [{ product: 'product', quantity }] },
        }),
      )
      const order = Object.assign(mock<OrderWithPaymentProofs>(), locked, {
        id: 'order',
        createdAt: now,
        paymentProofs: [
          { product: 'product', chain: 'ethereum', transactionHash: `0x${'ab'.repeat(32)}` },
        ],
      })
      req.payload.findByID.mockResolvedValue(order)
      vi.mocked(getPayloadInstance).mockResolvedValue(req.payload)
      vi.mocked(verifyEthereumNativeTransfer).mockResolvedValue({
        chain: 'ethereum',
        ok: true,
        observedTimestampMs: Date.now(),
      })
      expect((await verifyTransactionOccurred('order')).ok).toBe(true)
      expect(vi.mocked(verifyEthereumNativeTransfer).mock.calls[0][0].expectedAmount).toBe(
        order.cryptoPrices![0].expectedNativeAmount,
      )
    },
  )

  it('combines case-equivalent Ethereum hashes before comparing the total payment amount', async () => {
    const payload = mockDeep<Payload>()
    vi.mocked(getPayloadInstance).mockResolvedValue(payload)
    const hash = `0x${'ab'.repeat(32)}`
    const address = `0x${'11'.repeat(20)}`
    const order = Object.assign(mock<OrderWithPaymentProofs>(), {
      id: 'order',
      createdAt: new Date().toISOString(),
      paymentProofs: [
        { product: 'first', chain: 'ethereum', transactionHash: hash },
        { product: 'second', chain: 'ethereum', transactionHash: `0x${'AB'.repeat(32)}` },
      ],
      paymentTargets: ['first', 'second'].map((productID) => ({
        productID,
        chain: 'ethereum',
        recipientAddress: address,
        normalizedRecipientAddress: address,
        quantity: 1,
        unitAmount: 10,
        stableAmount: 10,
      })),
      cryptoPrices: [
        { chain: 'ethereum', nativePerStable: '0.001', fetchedAt: new Date().toISOString() },
      ],
    })
    payload.findByID.mockResolvedValue(order)
    const result = await verifyTransactionOccurred('order')
    // One real transfer of 0.01 ETH cannot pay two items totaling 0.02 ETH.
    expect(result.ok).toBe(false)
    expect(verifyEthereumNativeTransfer).toHaveBeenCalledTimes(1)
  })

  it.each([
    { name: 'rejects a late payment against a two-day-old quote', timely: false },
    { name: 'accepts an on-time payment even when finality is checked two days later', timely: true },
  ])('$name', async (scenario) => {
    const payload = mockDeep<Payload>()
    vi.mocked(getPayloadInstance).mockResolvedValue(payload)
    const address = `0x${'11'.repeat(20)}`
    const oldTimestamp = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    vi.mocked(verifyEthereumNativeTransfer).mockResolvedValue({
      chain: 'ethereum', ok: true,
      observedTimestampMs: scenario.timely ? Date.parse(oldTimestamp) + 1000 : Date.now(),
    })
    payload.findByID.mockResolvedValue(
      Object.assign(mock<OrderWithPaymentProofs>(), {
        id: 'order',
        createdAt: oldTimestamp,
        paymentProofs: [
          { product: 'first', chain: 'ethereum', transactionHash: `0x${'ab'.repeat(32)}` },
        ],
        paymentTargets: [
          {
            productID: 'first',
            chain: 'ethereum',
            recipientAddress: address,
            normalizedRecipientAddress: address,
            quantity: 1,
            unitAmount: 10,
            stableAmount: 10,
          },
        ],
        cryptoPrices: [{ chain: 'ethereum', fetchedAt: oldTimestamp, nativePerStable: '0.001' }],
      }),
    )
    await expect(verifyTransactionOccurred('order')).resolves.toMatchObject({ ok: scenario.timely })
  })
})
