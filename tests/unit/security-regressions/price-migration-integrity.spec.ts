import { describe, expect, it } from 'vitest'
import { mockDeep } from 'vitest-mock-extended'
import type { MigrateUpArgs } from '@payloadcms/db-mongodb'
import { ObjectId } from 'mongodb'
import { up } from '@/migrations/20260309_235650_backfill_product_prices_usd'

describe('Legacy price migration integrity', () => {
  it('converts a valid legacy amount when the new price field is null instead of enabling a free product', async () => {
    const args = mockDeep<MigrateUpArgs>()
    const id = new ObjectId()
    args.payload.db.collections.products.collection.find.mockReturnValue(
      mockDeep<ReturnType<typeof args.payload.db.collections.products.collection.find>>({
        toArray: async () => [
          { _id: id, price: { amount: 25, currency: 'USD' }, priceInUSD: null },
        ],
      }),
    )
    await up(args)
    expect(args.payload.db.collections.products.collection.updateOne).toHaveBeenCalledWith(
      { _id: id },
      { $set: { priceInUSD: 2500, priceInUSDEnabled: true } },
      { session: args.session },
    )
  })

  it('does not turn an absent legacy amount into a new free price', async () => {
    const args = mockDeep<MigrateUpArgs>()
    args.payload.db.collections.products.collection.find.mockReturnValue(
      mockDeep<ReturnType<typeof args.payload.db.collections.products.collection.find>>({
        toArray: async () => [{ _id: new ObjectId(), price: null }],
      }),
    )
    await up(args)
    expect(args.payload.db.collections.products.collection.updateOne).not.toHaveBeenCalled()
  })

  it('preserves a deliberately configured zero price', async () => {
    const args = mockDeep<MigrateUpArgs>()
    const id = new ObjectId()
    args.payload.db.collections.products.collection.find.mockReturnValue(
      mockDeep<ReturnType<typeof args.payload.db.collections.products.collection.find>>({
        toArray: async () => [{ _id: id, price: 25, priceInUSD: 0, priceInUSDEnabled: true }],
      }),
    )
    await up(args)
    expect(args.payload.db.collections.products.collection.updateOne).not.toHaveBeenCalled()
  })
})
