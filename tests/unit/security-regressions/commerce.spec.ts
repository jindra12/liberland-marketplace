import { describe, expect, it, vi } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'
import type { CollectionAfterChangeHook, Payload, PayloadRequest } from 'payload'
import type { Company, Product, Variant } from '@/payload-types'
import { resolveProductPaymentTargetsFromItems } from '@/crypto/recipient'
import { autoConfirmOrderOnPaymentProofAdd } from '@/hooks/autoConfirmOrderOnPaymentProofAdd'

const { confirmOrder } = vi.hoisted(() => ({ confirmOrder: vi.fn() }))
vi.mock('@/payments/cryptoAdapter', () => ({ cryptoAdapter: () => ({ confirmOrder }) }))
// Address normalization is not under test; no RPC or live-chain dependency is needed.
vi.mock('@/crypto/ethereum', () => ({
  normalizeEthereumAddress: (address: string) => address.toLowerCase(),
}))
vi.mock('@/crypto/tron', () => ({
  normalizeTronAddress: (address: string) => {
    if (address === 'undefined') {
      throw new Error('Invalid payment wallet address')
    }
    return address
  },
}))

describe('Commerce invariants', () => {
  const wallet = {
    chain: 'ethereum' as const,
    address: '0x1111111111111111111111111111111111111111',
  }

  it('an empty product wallet falls back to the company wallet', async () => {
    const payload = mockDeep<Payload>()
    payload.findByID
      .mockResolvedValueOnce(
        Object.assign(mock<Product>(), {
          id: 'product',
          company: 'company',
          priceInUSD: 1000,
          cryptoAddresses: {},
        }),
      )
      .mockResolvedValueOnce(mock<Company>({ cryptoAddresses: wallet }))
    await expect(
      resolveProductPaymentTargetsFromItems({
        payload,
        items: [{ product: 'product', quantity: 1 }],
      }),
    ).resolves.toMatchObject([{ recipientAddress: wallet.address }])
  })

  it('variant pricing is used for its payment target', async () => {
    const payload = mockDeep<Payload>()
    payload.findByID
      .mockResolvedValueOnce(mock<Variant>({ product: 'product', priceInUSD: 2500 }))
      .mockResolvedValueOnce(
        mock<Product>({ id: 'product', priceInUSD: 1000, cryptoAddresses: wallet }),
      )
    await expect(
      resolveProductPaymentTargetsFromItems({
        payload,
        items: [{ variant: 'variant', quantity: 1 }],
      }),
    ).resolves.toMatchObject([{ stableAmount: 25 }])
  })

  it('adding just the first of two required proofs must not trigger terminal confirmation', async () => {
    confirmOrder.mockReset()
    const req = mockDeep<PayloadRequest>()
    await autoConfirmOrderOnPaymentProofAdd(
      Object.assign(mock<Parameters<CollectionAfterChangeHook>[0]>(), {
        req,
        operation: 'update',
        context: {},
        previousDoc: { paymentProofs: [] },
        doc: {
          id: 'order',
          status: 'processing',
          items: [
            { product: 'one', quantity: 1 },
            { product: 'two', quantity: 1 },
          ],
          paymentProofs: [{ productID: 'one', chain: 'ethereum', transactionHash: '0xfixture' }],
        },
      }),
    )
    expect(confirmOrder).not.toHaveBeenCalled()
  })
})
