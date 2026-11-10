import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { createLocalReq } from 'payload'
import {
  updateSellerOrderProductFulfilled,
  updateSellerOrderProductRejected,
} from '@/graphql/sellerOrders'
import { createMongoSecurityFixture, synchronizeMongoWrites } from './mongo/utils'

vi.mock('@/utilities/sendAuthEmail', () => ({ sendAuthEmail: vi.fn() }))
vi.mock('@payloadcms/email-nodemailer', () => ({
  nodemailerAdapter: async () => () => ({
    name: 'isolated-email',
    defaultFromAddress: 'fixture@example.test',
    defaultFromName: 'Fixture',
    sendEmail: vi.fn(),
  }),
}))

const payload = await createMongoSecurityFixture()
const buyerID = new Types.ObjectId()
const sellerID = new Types.ObjectId()
const companyID = new Types.ObjectId()
const products = [new Types.ObjectId(), new Types.ObjectId()]
const orderID = new Types.ObjectId()
const firstProofID = new Types.ObjectId().toHexString()
const secondHash = `0x${'a'.repeat(64)}`

beforeEach(async () => {
  await payload.db.collections.users.collection.insertMany([
    {
      _id: buyerID,
      name: 'Buyer',
      email: 'proof-buyer@example.test',
      emailVerified: true,
      role: ['user'],
    },
    {
      _id: sellerID,
      name: 'Seller',
      email: 'proof-seller@example.test',
      emailVerified: true,
      role: ['admin'],
    },
  ])
  await payload.db.collections.companies.collection.insertOne({
    _id: companyID,
    name: 'Seller company',
    createdBy: sellerID,
    isPrivate: false,
    _status: 'published',
  })
  await payload.db.collections.products.collection.insertMany(
    products.map((_id) => ({
      _id,
      name: 'Ordered product',
      company: companyID,
      createdBy: sellerID,
      _status: 'published',
    })),
  )
  await payload.db.collections.orders.collection.insertOne({
    _id: orderID,
    customer: buyerID,
    status: 'processing',
    items: products.map((product) => ({ product, quantity: 1 })),
    paymentProofs: [
      {
        id: firstProofID,
        product: products[0],
        chain: 'ethereum',
        transactionHash: `0x${'1'.repeat(64)}`,
        fulfilled: false,
        rejected: false,
      },
    ],
  })
})
afterEach(async () => {
  await Promise.all(
    ['users', 'companies', 'products', 'orders'].map((collection) =>
      payload.db.collections[collection].deleteMany({}),
    ),
  )
})

const submit = async (hash: string, product = products[1].toHexString()) => {
  const user = await payload.findByID({ collection: 'users', id: buyerID.toHexString(), depth: 0 })
  const req = await createLocalReq({ user }, payload)
  return payload.update({
    collection: 'orders',
    id: orderID.toHexString(),
    overrideAccess: false,
    req,
    context: { skipAutoOrderCryptoConfirm: true },
    data: {
      paymentProofs: [
        { product, chain: 'ethereum', transactionHash: hash, fulfilled: true, rejected: true },
      ],
    },
  })
}

describe('Standalone customer and seller proof concurrency', () => {
  it("does not let the buyer use seller tools to fulfill another account's product", async () => {
    const buyer = await payload.findByID({
      collection: 'users',
      id: buyerID.toHexString(),
      depth: 0,
    })
    const req = await createLocalReq({ user: buyer }, payload)
    await expect(
      updateSellerOrderProductFulfilled({
        req,
        orderId: orderID.toHexString(),
        paymentProofId: firstProofID,
        fulfilled: true,
      }),
    ).rejects.toThrow(/do not own/i)
    const order = await payload.findByID({
      collection: 'orders',
      id: orderID.toHexString(),
      depth: 0,
    })
    expect(order.paymentProofs?.[0].fulfilled).toBe(false)
  })

  it('does not add a second shippable proof after an order has completed', async () => {
    await payload.db.collections.orders.updateOne({ _id: orderID }, { status: 'completed' })
    await expect(submit(secondHash)).rejects.toThrow(/processing orders/i)
    const order = await payload.findByID({
      collection: 'orders',
      id: orderID.toHexString(),
      depth: 0,
    })
    expect(order.paymentProofs).toHaveLength(1)
  })

  it('preserves a seller decision while a customer concurrently appends a proof with forged flags', async () => {
    const seller = await payload.findByID({
      collection: 'users',
      id: sellerID.toHexString(),
      depth: 0,
    })
    const req = await createLocalReq({ user: seller }, payload)
    const release = synchronizeMongoWrites(payload, 'orders', orderID.toHexString())
    try {
      await Promise.all([
        submit(secondHash),
        updateSellerOrderProductRejected({
          req,
          orderId: orderID.toHexString(),
          paymentProofId: firstProofID,
          rejected: true,
        }),
      ])
      const order = await payload.findByID({
        collection: 'orders',
        id: orderID.toHexString(),
        depth: 0,
      })
      expect(order.paymentProofs).toHaveLength(2)
      expect(order.paymentProofs?.find((proof) => proof.id === firstProofID)).toMatchObject({
        rejected: true,
        fulfilled: false,
      })
      expect(
        order.paymentProofs?.find((proof) => proof.transactionHash === secondHash),
      ).toMatchObject({ fulfilled: false, rejected: false })
    } finally {
      release()
    }
  })

  it('deduplicates simultaneous case-equivalent submissions without losing either ordered product', async () => {
    const release = synchronizeMongoWrites(payload, 'orders', orderID.toHexString())
    try {
      await Promise.all([submit(secondHash), submit(`0x${'A'.repeat(64)}`)])
      const order = await payload.findByID({
        collection: 'orders',
        id: orderID.toHexString(),
        depth: 0,
      })
      expect(order.paymentProofs).toHaveLength(2)
      expect(
        order.paymentProofs?.filter((proof) => proof.transactionHash === secondHash),
      ).toHaveLength(1)
    } finally {
      release()
    }
  })

  it('rejects an unrelated product before persisting any proof change', async () => {
    await expect(submit(secondHash, new Types.ObjectId().toHexString())).rejects.toThrow(
      /product.*order/i,
    )
    const order = await payload.findByID({
      collection: 'orders',
      id: orderID.toHexString(),
      depth: 0,
    })
    expect(order.paymentProofs).toHaveLength(1)
    expect(order.paymentProofs?.[0].fulfilled).toBe(false)
    expect(await payload.count({ collection: 'payment-settlements' })).toMatchObject({
      totalDocs: 0,
    })
  })
})
