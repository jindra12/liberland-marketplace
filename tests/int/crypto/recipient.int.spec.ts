import { describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import {
  resolveProductIDsForItems,
  resolveProductPaymentTargetsFromItems,
  resolveRecipientAddressesForItems,
} from '@/crypto/recipient'

type FakeCollections = {
  companies: Record<string, unknown>
  products: Record<string, unknown>
  variants: Record<string, unknown>
}

/**
 * Very small in-memory Payload Local API fake used by recipient utilities.
 *
 * It only implements findByID for collections touched by recipient.ts:
 * - companies
 * - products
 * - variants
 */
const createFakePayload = (collections: FakeCollections): Pick<Payload, 'findByID'> => ({
  findByID: async ({ collection, id }) => {
    const source = collections[collection as keyof FakeCollections]
    if (!source) {
      throw new Error(`Unknown collection ${String(collection)}`)
    }

    const doc = source[String(id)]
    if (!doc) {
      throw new Error(`Document ${String(collection)}/${String(id)} not found`)
    }

    return doc as never
  },
})

describe('crypto/recipient integration with fake payload db', () => {
  it('resolves per-product payment targets and aggregates repeated product lines', async () => {
    const payload = createFakePayload({
      companies: {
        comp_eth: {
          id: 'comp_eth',
          cryptoAddresses: {
            chain: 'ethereum',
            address: '0x1111111111111111111111111111111111111111',
          },
        },
      },
      products: {
        prod_fallback_eth: {
          id: 'prod_fallback_eth',
          company: 'comp_eth',
          price: { amount: 10 },
          // no product-level wallet => fallback to company wallet
          cryptoAddresses: null,
        },
        prod_override_sol: {
          id: 'prod_override_sol',
          company: 'comp_eth',
          price: { amount: 5 },
          // product-level wallet overrides company wallet
          cryptoAddresses: {
            chain: 'solana',
            address: 'So11111111111111111111111111111111111111112',
          },
        },
      },
      variants: {
        var_for_eth_product: {
          id: 'var_for_eth_product',
          product: 'prod_fallback_eth',
        },
      },
    })

    const items = [
      // direct product line
      { product: 'prod_fallback_eth', quantity: 2 },
      // variant line that maps to the same product (should be aggregated)
      { variant: 'var_for_eth_product', quantity: 3 },
      // second product with explicit wallet override
      { product: 'prod_override_sol', quantity: 1 },
    ]

    const productIDs = await resolveProductIDsForItems({
      items,
      payload,
    })

    expect(productIDs).toEqual(['prod_fallback_eth', 'prod_override_sol'])

    const targets = await resolveProductPaymentTargetsFromItems({
      items,
      payload,
    })

    expect(targets).toHaveLength(2)

    const ethTarget = targets.find((entry) => entry.productID === 'prod_fallback_eth')
    const solTarget = targets.find((entry) => entry.productID === 'prod_override_sol')

    expect(ethTarget).toBeDefined()
    expect(solTarget).toBeDefined()

    // Product appears twice (2 + 3 quantity), unit price = 10 stable.
    expect(ethTarget?.quantity).toBe(5)
    expect(ethTarget?.stableAmount).toBe(50)
    expect(ethTarget?.chain).toBe('ethereum')

    // Product wallet override keeps this one on Solana.
    expect(solTarget?.quantity).toBe(1)
    expect(solTarget?.stableAmount).toBe(5)
    expect(solTarget?.chain).toBe('solana')

    const ethRecipients = await resolveRecipientAddressesForItems({
      chain: 'ethereum',
      items,
      payload,
    })

    expect(ethRecipients).toEqual(['0x1111111111111111111111111111111111111111'])
  })

  it('fails with a clear error when neither product nor company wallet is configured', async () => {
    const payload = createFakePayload({
      companies: {
        comp_without_wallet: {
          id: 'comp_without_wallet',
          cryptoAddresses: null,
        },
      },
      products: {
        prod_without_wallet: {
          id: 'prod_without_wallet',
          company: 'comp_without_wallet',
          price: { amount: 15 },
          cryptoAddresses: null,
        },
      },
      variants: {},
    })

    await expect(
      resolveProductPaymentTargetsFromItems({
        items: [{ product: 'prod_without_wallet', quantity: 1 }],
        payload,
      }),
    ).rejects.toThrow('Missing payout wallet for product prod_without_wallet')
  })
})
