import { describe, expect, it, vi } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'
import type { CollectionBeforeChangeHook, PayloadRequest } from 'payload'
import type { Product } from '@/payload-types'
import { lockOrderCryptoPricesOnCreate } from '@/hooks/lockOrderCryptoPricesOnCreate'

vi.mock('@/crypto/ethereum', () => ({
  normalizeEthereumAddress: (address: string) => address.toLowerCase(),
}))
vi.mock('@/crypto/rates/cache', () => ({
  buildOrderCryptoPricesFromCache: vi.fn().mockResolvedValue([]),
}))

describe('Order creation product eligibility', () => {
  it.each([
    { label: 'an explicitly non-orderable product', orderable: false, inventory: 10, quantity: 1 },
    { label: 'a product with exhausted finite stock', orderable: true, inventory: 0, quantity: 1 },
    {
      label: 'a quantity above the available finite stock',
      orderable: true,
      inventory: 1,
      quantity: 2,
    },
  ])('does not lock a payable order for $label', async (fixture) => {
    const req = mockDeep<PayloadRequest>()
    req.payload.findByID.mockResolvedValue(
      Object.assign(mock<Product>(), {
        id: 'product',
        orderable: fixture.orderable,
        inventory: fixture.inventory,
        unlimitedInventory: false,
        priceInUSD: 1000,
        cryptoAddresses: { chain: 'ethereum', address: `0x${'11'.repeat(20)}` },
      }),
    )
    const args = Object.assign(mock<Parameters<CollectionBeforeChangeHook>[0]>(), {
      req,
      operation: 'create',
      data: {
        amount: 1000 * fixture.quantity,
        items: [{ product: 'product', quantity: fixture.quantity }],
      },
    })
    await expect(lockOrderCryptoPricesOnCreate(args)).rejects.toThrow(
      /orderable|stock|inventory|quantity/i,
    )
  })
})
