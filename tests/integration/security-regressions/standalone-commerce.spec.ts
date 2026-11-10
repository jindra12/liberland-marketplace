import { describe, expect, it, vi } from 'vitest'
import { ObjectId } from 'mongodb'
import { createLocalReq } from 'payload'
import { mock } from 'vitest-mock-extended'
import { createMongoSecurityFixture } from './mongo/utils'

vi.mock('@/utilities/sendAuthEmail', () => ({ sendAuthEmail: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@payloadcms/email-nodemailer', () => ({
  nodemailerAdapter: async () => () => ({
    name: 'isolated-email',
    defaultFromAddress: 'fixture@example.test',
    defaultFromName: 'Fixture',
    sendEmail: vi.fn(),
  }),
}))

const payload = await createMongoSecurityFixture()

describe('Standalone MongoDB commerce', () => {
  it('completes an order, counts its units and applies inventory once without a replica set', async () => {
    const userID = new ObjectId()
    const companyID = new ObjectId()
    const productID = new ObjectId()
    const orderID = new ObjectId()
    await payload.db.collections.users.collection.insertOne({
      _id: userID,
      name: 'Standalone seller',
      email: 'standalone-seller@example.test',
      emailVerified: true,
      role: ['admin'],
    })
    await payload.db.collections.companies.collection.insertOne({
      _id: companyID,
      name: 'Standalone company',
      createdBy: userID,
      isPrivate: false,
      _status: 'published',
    })
    await payload.db.collections.products.collection.insertOne({
      _id: productID,
      name: 'Standalone product',
      company: companyID,
      createdBy: userID,
      inventory: 10,
      purchaseCount: 5,
      unlimitedInventory: false,
      _status: 'published',
    })
    await payload.db.collections.orders.collection.insertOne({
      _id: orderID,
      customer: userID,
      status: 'processing',
      items: [{ product: productID, quantity: 3 }],
    })
    const user = await payload.findByID({ collection: 'users', id: userID.toHexString() })
    const req = await createLocalReq({ user }, payload)
    const order = await payload.update({
      collection: 'orders',
      overrideAccess: false,
      id: orderID.toHexString(),
      data: { status: 'completed' },
      req,
      context: { skipAutoOrderCryptoConfirm: true },
    })
    expect(order.status).toBe('completed')
    expect(payload.db.connection.getClient().options.replicaSet).toBeUndefined()
    vi.spyOn(payload, 'auth').mockResolvedValue(
      mock<Awaited<ReturnType<typeof payload.auth>>>({
        user: { ...user, collection: 'users' },
      }),
    )
    const { POST } = await import('@/app/api/orders/[id]/update-inventory/route')
    const deduct = () =>
      POST(
        new Request(`https://backend.example/api/orders/${orderID}/update-inventory`, {
          method: 'POST',
        }),
      )
    expect((await deduct()).status).toBe(200)
    expect((await deduct()).status).toBe(200)
    const product = await payload.findByID({ collection: 'products', id: productID.toHexString() })
    expect(product.inventory).toBe(7)
    expect(product.purchaseCount).toBe(8)
  })
})
