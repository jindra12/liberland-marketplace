import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { createLocalReq, type CollectionBeforeChangeHook } from 'payload'
import { cryptoAdapter } from '@/payments/cryptoAdapter'
import { createMongoSecurityFixture } from './mongo/utils'

vi.mock('@/crypto', () => ({
  verifyTransactionOccurred: vi.fn(async (orderId: string) => ({ orderId, ok: true, results: [] })),
}))
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
const companyID = new Types.ObjectId()
const productID = new Types.ObjectId()
const orderID = new Types.ObjectId()
beforeEach(async () => {
  await payload.db.collections.users.collection.insertOne({
    _id: buyerID,
    name: 'Buyer',
    email: 'payment-buyer@example.test',
    emailVerified: true,
    role: ['user'],
  })
  await payload.db.collections.companies.collection.insertOne({
    _id: companyID,
    name: 'Payable company',
    createdBy: buyerID,
    isPrivate: false,
    _status: 'published',
  })
  await payload.db.collections.products.collection.insertOne({
    _id: productID,
    name: 'Payable product',
    company: companyID,
    createdBy: buyerID,
    _status: 'published',
    purchaseCount: 0,
  })
  await payload.db.collections.orders.collection.insertOne({
    _id: orderID,
    customer: buyerID,
    customerEmail: 'payment-buyer@example.test',
    status: 'processing',
    amount: 1000,
    currency: 'USD',
    items: [{ product: productID, quantity: 2 }],
    paymentProofs: [
      {
        id: new Types.ObjectId().toHexString(),
        product: productID,
        chain: 'ethereum',
        transactionHash: `0x${'a'.repeat(64)}`,
      },
    ],
  })
})
afterEach(async () => {
  await Promise.all(
    ['users', 'companies', 'products', 'orders', 'transactions', 'payment-settlements'].map(
      (collection) => payload.db.collections[collection].deleteMany({}),
    ),
  )
  await Promise.all(Object.values(payload.db.versions).map((model) => model.deleteMany({})))
})

const confirm = async () => {
  const user = await payload.findByID({ collection: 'users', id: buyerID.toHexString(), depth: 0 })
  return cryptoAdapter().confirmOrder({
    data: { orderID: orderID.toHexString() },
    req: await createLocalReq({ user }, payload),
  })
}
const assertSettledOnce = async () => {
  expect(await payload.count({ collection: 'transactions' })).toMatchObject({ totalDocs: 1 })
  expect(await payload.count({ collection: 'payment-settlements' })).toMatchObject({ totalDocs: 1 })
  const order = await payload.findByID({
    collection: 'orders',
    id: orderID.toHexString(),
    depth: 0,
  })
  expect(order.status).toBe('completed')
  expect(order.transactions).toHaveLength(1)
  const product = await payload.findByID({
    collection: 'products',
    id: productID.toHexString(),
    depth: 0,
  })
  expect(product.purchaseCount).toBe(2)
}

describe('Standalone payment confirmation recovery', () => {
  it('reconciles two simultaneous confirmations to one transaction, claim and purchased-unit application', async () => {
    const arrivals = { count: 0 }
    const release = vi.fn<() => void>()
    const gate = new Promise<void>((resolve) => release.mockImplementation(resolve))
    const barrier: CollectionBeforeChangeHook = async ({ data, operation }) => {
      if (
        operation === 'create' &&
        String(data.order) === orderID.toHexString() &&
        arrivals.count < 2
      ) {
        arrivals.count += 1
        if (arrivals.count === 2) {
          release()
        }
        await gate
      }
      return data
    }
    const hooks = payload.collections.transactions.config.hooks.beforeChange
    hooks.push(barrier)
    try {
      const results = await Promise.all([confirm(), confirm()])
      expect(arrivals.count).toBe(2)
      expect(results[0].transactionID).toBe(results[1].transactionID)
      await assertSettledOnce()
    } finally {
      release()
      hooks.splice(hooks.indexOf(barrier), 1)
    }
  })

  it('resumes the original verified payment and transaction after order completion is interrupted', async () => {
    const failure: CollectionBeforeChangeHook = ({ data }) => {
      if (data.status === 'completed') {
        throw new Error('Interrupted completion')
      }
      return data
    }
    const hooks = payload.collections.orders.config.hooks.beforeChange
    hooks.push(failure)
    try {
      await expect(confirm()).rejects.toThrow('Interrupted completion')
      expect(await payload.count({ collection: 'transactions' })).toMatchObject({ totalDocs: 1 })
      expect(await payload.count({ collection: 'payment-settlements' })).toMatchObject({
        totalDocs: 1,
      })
    } finally {
      hooks.splice(hooks.indexOf(failure), 1)
    }
    await confirm()
    await confirm()
    await assertSettledOnce()
  })
})
