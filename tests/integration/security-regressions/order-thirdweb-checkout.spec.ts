import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { createLocalReq } from 'payload'
import { configToSchema } from '@payloadcms/graphql'
import { graphql } from 'graphql/index.js'
import { createMongoSecurityFixture } from './mongo/utils'
import { providerEvent, providerRequest } from './hostedPayments/utils'
import {
  createOrderCheckoutSession,
  verifyOrderCheckoutSession,
} from '@/payments/orderCheckout/service'
import { acceptThirdwebPayment, findCheckoutSession } from '@/payments/service'
import { verifyEthereumNativeTransfer } from '@/crypto/verification/ethereum'

vi.mock('@/crypto/payload', () => ({ getPayloadInstance: async () => payload }))
vi.mock('@/crypto/verification/ethereum', () => ({ verifyEthereumNativeTransfer: vi.fn() }))
vi.mock('@/utilities/sendAuthEmail', () => ({ sendAuthEmail: vi.fn() }))
vi.mock('@payloadcms/email-nodemailer', () => ({
  nodemailerAdapter: async () => () => ({
    name: 'fixture',
    defaultFromAddress: 'test@example.test',
    defaultFromName: 'Fixture',
    sendEmail: vi.fn(),
  }),
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

const payload = await createMongoSecurityFixture()
const { schema } = configToSchema(payload.config)
const buyerId = new Types.ObjectId()
const sellerId = new Types.ObjectId()
const companyId = new Types.ObjectId()
const identityId = new Types.ObjectId()
const productId = new Types.ObjectId()
const orderId = new Types.ObjectId()
const wallet = `0x${'1'.repeat(40)}`

const buyerRequest = async () =>
  createLocalReq(
    {
      user: await payload.findByID({ collection: 'users', id: String(buyerId) }),
    },
    payload,
  )

beforeEach(async () => {
  vi.stubEnv('THIRDWEB_CLIENT_ID', 'test-project')
  vi.stubEnv('THIRDWEB_WEBHOOK_SECRET', 'test-provider-secret')
  await payload.updateGlobal({
    slug: 'marketplace-payments',
    data: { thirdwebCheckoutEnabled: true },
    overrideAccess: true,
  })
  vi.mocked(verifyEthereumNativeTransfer).mockReset().mockResolvedValue({
    chain: 'ethereum',
    ok: false,
    error: 'No native payment was sent.',
  })
  await payload.db.collections.users.collection.insertMany([
    {
      _id: buyerId,
      name: 'Buyer',
      email: 'buyer@example.test',
      emailVerified: true,
      role: ['user'],
    },
    {
      _id: sellerId,
      name: 'Seller',
      email: 'seller@example.test',
      emailVerified: true,
      role: ['user'],
    },
  ])
  await payload.db.collections.identities.collection.insertOne({
    _id: identityId,
    name: 'Tribe',
    _status: 'published',
  })
  await payload.db.collections.companies.collection.insertOne({
    _id: companyId,
    identity: identityId,
    name: 'Seller',
    createdBy: sellerId,
    _status: 'published',
    isPrivate: false,
    acceptThirdwebPayments: true,
  })
  await payload.db.collections.products.collection.insertOne({
    _id: productId,
    company: companyId,
    name: 'Product',
    createdBy: sellerId,
    _status: 'published',
    orderable: true,
    priceInUSD: 500,
    priceInUSDEnabled: true,
    inventory: 10,
    unlimitedInventory: false,
    purchaseCount: 0,
  })
  await payload.db.collections.orders.collection.insertOne({
    _id: orderId,
    customer: buyerId,
    customerEmail: 'buyer@example.test',
    status: 'processing',
    amount: 1000,
    currency: 'USD',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items: [{ id: new Types.ObjectId().toHexString(), product: productId, quantity: 2 }],
    paymentTargets: [
      {
        chain: 'ethereum',
        productID: String(productId),
        quantity: 2,
        unitAmount: 5,
        stableAmount: 10,
        recipientAddress: wallet,
        normalizedRecipientAddress: wallet,
      },
    ],
    shippingAddress: {
      firstName: 'Buyer',
      lastName: 'Person',
      addressLine1: 'Main Street 1',
      city: 'Town',
      postalCode: '12345',
      country: 'US',
    },
  })
})

afterEach(async () => {
  await Promise.all(
    [
      'users',
      'companies',
      'identities',
      'products',
      'orders',
      'transactions',
      'payment-settlements',
      'checkout-sessions',
      'payload-jobs',
    ].map((name) => payload.db.collections[name].deleteMany({})),
  )
  await Promise.all(Object.values(payload.db.versions).map((model) => model.deleteMany({})))
})

describe('Thirdweb normal-order settlement', () => {
  it('requires explicit operator setup even when Thirdweb credentials are present', async () => {
    await payload.updateGlobal({
      slug: 'marketplace-payments',
      data: { thirdwebCheckoutEnabled: false },
      overrideAccess: true,
    })
    const req = await buyerRequest()
    const result = await graphql({
      schema,
      source:
        'query CheckoutOptions($id: String!) { Order(id: $id) { thirdwebCheckoutAvailable thirdwebCheckoutRecipients } }',
      variableValues: { id: String(orderId) },
      contextValue: { req },
    })
    expect(result.errors).toBeUndefined()
    expect(result.data?.Order).toMatchObject({
      thirdwebCheckoutAvailable: false,
      thirdwebCheckoutRecipients: [],
    })
    await expect(createOrderCheckoutSession(req, String(orderId), wallet)).rejects.toMatchObject({
      status: 503,
    })
    await expect(
      payload.updateGlobal({
        slug: 'marketplace-payments',
        data: { thirdwebCheckoutEnabled: true },
        req,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('hides card checkout and rejects direct session creation when the company has not opted in', async () => {
    await payload.db.collections.companies.updateOne(
      { _id: companyId },
      { $set: { acceptThirdwebPayments: false } },
    )
    const req = await buyerRequest()
    const result = await graphql({
      schema,
      source:
        'query CheckoutOptions($id: String!) { Order(id: $id) { thirdwebCheckoutRecipients } }',
      variableValues: { id: String(orderId) },
      contextValue: { req },
    })
    expect(result.errors).toBeUndefined()
    expect(result.data?.Order).toMatchObject({ thirdwebCheckoutRecipients: [] })
    await expect(createOrderCheckoutSession(req, String(orderId), wallet)).rejects.toMatchObject({
      status: 409,
    })
    expect((await payload.count({ collection: 'checkout-sessions' })).totalDocs).toBe(0)
  })

  it.each([true, false])(
    'keeps consent scoped to the recipient group (shared wallet: %s)',
    async (sharedWallet) => {
      const otherCompany = new Types.ObjectId()
      const otherProduct = new Types.ObjectId()
      const otherWallet = sharedWallet ? wallet : `0x${'3'.repeat(40)}`
      await payload.db.collections.companies.collection.insertOne({
        _id: otherCompany,
        name: 'ETH-only seller',
        createdBy: sellerId,
        acceptThirdwebPayments: false,
        _status: 'published',
        isPrivate: false,
      })
      await payload.db.collections.products.collection.insertOne({
        _id: otherProduct,
        company: otherCompany,
        name: 'ETH-only product',
        _status: 'published',
      })
      await payload.db.collections.orders.updateOne(
        { _id: orderId },
        {
          $push: {
            paymentTargets: {
              chain: 'ethereum',
              productID: String(otherProduct),
              quantity: 1,
              unitAmount: 5,
              stableAmount: 5,
              recipientAddress: otherWallet,
              normalizedRecipientAddress: otherWallet,
            },
          },
        },
      )
      const req = await buyerRequest()
      const result = await graphql({
        schema,
        source:
          'query CheckoutOptions($id: String!) { Order(id: $id) { thirdwebCheckoutRecipients } }',
        variableValues: { id: String(orderId) },
        contextValue: { req },
      })
      expect(result.errors).toBeUndefined()
      expect(result.data?.Order).toMatchObject({
        thirdwebCheckoutRecipients: sharedWallet ? [] : [wallet],
      })
      await expect(
        createOrderCheckoutSession(req, String(orderId), otherWallet),
      ).rejects.toMatchObject({ status: 409 })
    },
  )

  it('blocks reopening an unpaid session after opt-out but honors an already-sent payment', async () => {
    const req = await buyerRequest()
    const session = await createOrderCheckoutSession(req, String(orderId), wallet)
    await payload.db.collections.companies.updateOne(
      { _id: companyId },
      { $set: { acceptThirdwebPayments: false } },
    )
    await expect(createOrderCheckoutSession(req, String(orderId), wallet)).rejects.toMatchObject({
      status: 409,
    })
    const provider = await providerRequest(payload, providerEvent(session.publicId, wallet))
    await acceptThirdwebPayment(provider.req, provider.body)
    expect((await payload.findByID({ collection: 'orders', id: String(orderId) })).status).toBe(
      'completed',
    )
    expect((await findCheckoutSession(req, session.publicId)).orderRecordedAt).toBeTruthy()
  })

  it.each(['thirdweb', 'native'] as const)(
    'waits for the second %s recipient before completing the order and deducting each item once',
    async (method) => {
      const secondProductId = new Types.ObjectId()
      const secondWallet = `0x${'3'.repeat(40)}`
      const firstProduct = await payload.db.collections.products.collection.findOne({
        _id: productId,
      })
      await payload.db.collections.products.collection.insertOne({
        ...firstProduct,
        _id: secondProductId,
        name: 'Second product',
        priceInUSD: 1000,
      })
      await payload.db.collections.orders.updateOne(
        { _id: orderId },
        {
          $push: {
            items: {
              id: new Types.ObjectId().toHexString(),
              product: secondProductId,
              quantity: 1,
            },
            paymentTargets: {
              chain: 'ethereum',
              productID: String(secondProductId),
              quantity: 1,
              unitAmount: 10,
              stableAmount: 10,
              recipientAddress: secondWallet,
              normalizedRecipientAddress: secondWallet,
            },
          },
          $set: {
            amount: 2000,
            cryptoPrices: [
              {
                chain: 'ethereum',
                nativePerStable: '0.0005',
                stablePerNative: 2000,
                fetchedAt: new Date(Date.now() - 1000).toISOString(),
              },
            ],
          },
        },
      )
      const first = await createOrderCheckoutSession(await buyerRequest(), String(orderId), wallet)
      const firstProvider = await providerRequest(payload, providerEvent(first.publicId, wallet))
      await acceptThirdwebPayment(firstProvider.req, firstProvider.body)
      expect((await payload.findByID({ collection: 'orders', id: String(orderId) })).status).toBe(
        'processing',
      )
      expect(
        (await payload.findByID({ collection: 'products', id: String(productId) })).inventory,
      ).toBe(10)
      if (method === 'thirdweb') {
        const second = await createOrderCheckoutSession(
          await buyerRequest(),
          String(orderId),
          secondWallet,
        )
        const event = providerEvent(second.publicId, secondWallet)
        event.data.transactions[0].transactionHash = `0x${'b'.repeat(64)}`
        const secondProvider = await providerRequest(payload, event)
        await acceptThirdwebPayment(secondProvider.req, secondProvider.body)
      } else {
        vi.mocked(verifyEthereumNativeTransfer).mockResolvedValue({
          chain: 'ethereum',
          ok: true,
          observedTimestampMs: Date.now(),
          transactionHash: `0x${'b'.repeat(64)}`,
        })
        await payload.update({
          collection: 'orders',
          id: String(orderId),
          overrideAccess: false,
          req: await buyerRequest(),
          data: {
            paymentProofs: [
              {
                chain: 'ethereum',
                product: String(secondProductId),
                transactionHash: `0x${'b'.repeat(64)}`,
              },
            ],
          },
        })
      }
      await acceptThirdwebPayment(firstProvider.req, firstProvider.body)
      expect((await payload.findByID({ collection: 'orders', id: String(orderId) })).status).toBe(
        'completed',
      )
      expect(
        (await payload.findByID({ collection: 'products', id: String(productId) })).inventory,
      ).toBe(8)
      expect(
        (await payload.findByID({ collection: 'products', id: String(secondProductId) })).inventory,
      ).toBe(9)
      expect((await payload.count({ collection: 'transactions' })).totalDocs).toBe(1)
    },
  )

  it('repairs interrupted order confirmation from the saved receipt without charging again', async () => {
    const req = await buyerRequest()
    const session = await createOrderCheckoutSession(req, String(orderId), wallet)
    const provider = await providerRequest(payload, providerEvent(session.publicId, wallet))
    const hooks = payload.collections.orders.config.hooks.beforeChange
    const failure: import('payload').CollectionBeforeChangeHook = ({ data }) => {
      if (data.status === 'completed') {
        throw new Error('Interrupted order confirmation')
      }
      return data
    }
    hooks.push(failure)
    try {
      await expect(acceptThirdwebPayment(provider.req, provider.body)).rejects.toThrow(
        'Interrupted order confirmation',
      )
      expect((await findCheckoutSession(req, session.publicId)).status).toBe('paid')
    } finally {
      hooks.splice(hooks.indexOf(failure), 1)
    }
    await payload.jobs.run({ queue: 'notifications', overrideAccess: true, limit: 10 })
    expect((await findCheckoutSession(req, session.publicId)).orderRecordedAt).toBeTruthy()
    expect((await payload.findByID({ collection: 'orders', id: String(orderId) })).status).toBe(
      'completed',
    )
    expect(
      (await payload.findByID({ collection: 'products', id: String(productId) })).inventory,
    ).toBe(8)
    expect((await payload.count({ collection: 'transactions' })).totalDocs).toBe(1)
  })

  it('requires the order customer and ignores current catalog prices in favor of the frozen snapshot', async () => {
    await expect(
      createOrderCheckoutSession(await createLocalReq({}, payload), String(orderId), wallet),
    ).rejects.toMatchObject({ status: 401 })
    const seller = await payload.findByID({ collection: 'users', id: String(sellerId) })
    await expect(
      createOrderCheckoutSession(
        await createLocalReq({ user: seller }, payload),
        String(orderId),
        wallet,
      ),
    ).rejects.toThrow()
    await payload.db.collections.products.updateOne(
      { _id: productId },
      { $set: { priceInUSD: 9000 } },
    )
    const session = await createOrderCheckoutSession(await buyerRequest(), String(orderId), wallet)
    expect(session).toMatchObject({
      amountUsdCents: 1000,
      receiver: wallet,
      kind: 'order',
      order: String(orderId),
    })
    expect(session.webhookUrl).toBeUndefined()
    await expect(
      createOrderCheckoutSession(await buyerRequest(), String(orderId), `0x${'2'.repeat(40)}`),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('reuses the same session for concurrent creation requests and after reopening checkout', async () => {
    const sessions = await Promise.all(
      [1, 2].map(async () =>
        createOrderCheckoutSession(await buyerRequest(), String(orderId), wallet),
      ),
    )
    expect(sessions[0].publicId).toBe(sessions[1].publicId)
    expect((await payload.count({ collection: 'checkout-sessions' })).totalDocs).toBe(1)
    expect(
      (await createOrderCheckoutSession(await buyerRequest(), String(orderId), wallet)).publicId,
    ).toBe(sessions[0].publicId)
  })

  it('settles a signed receipt through normal orders, inventory and seller fulfillment, exactly once', async () => {
    const req = await buyerRequest()
    const created = await graphql({
      schema,
      source:
        'mutation Pay($orderId: String!, $recipient: String!) { createOrderCheckoutSession(orderId: $orderId, recipient: $recipient) { sessionId amountUsdCents paymentRecorded } }',
      variableValues: { orderId: String(orderId), recipient: wallet },
      contextValue: { req },
    })
    expect(created.errors).toBeUndefined()
    expect(created.data?.createOrderCheckoutSession).toMatchObject({
      amountUsdCents: 1000,
      paymentRecorded: false,
    })
    const session = (await payload.find({ collection: 'checkout-sessions', limit: 1 })).docs[0]
    const provider = await providerRequest(payload, providerEvent(session.publicId, wallet))
    const duplicate = await providerRequest(payload, providerEvent(session.publicId, wallet))
    await Promise.all([
      acceptThirdwebPayment(provider.req, provider.body),
      acceptThirdwebPayment(duplicate.req, duplicate.body),
    ])
    await verifyOrderCheckoutSession(req, await findCheckoutSession(req, session.publicId))
    const order = await payload.findByID({ collection: 'orders', id: String(orderId), depth: 0 })
    expect(order.status).toBe('completed')
    expect(order.shippingAddress?.addressLine1).toBe('Main Street 1')
    expect(order.paymentProofs).toMatchObject([
      { chain: 'ethereum', chainId: 8453, product: String(productId) },
    ])
    expect(
      (await payload.findByID({ collection: 'products', id: String(productId) })).inventory,
    ).toBe(8)
    expect((await payload.count({ collection: 'transactions' })).totalDocs).toBe(1)
    expect((await payload.count({ collection: 'payment-settlements' })).totalDocs).toBe(1)
    expect(verifyEthereumNativeTransfer).not.toHaveBeenCalled()
    const sellerReq = await createLocalReq(
      { user: await payload.findByID({ collection: 'users', id: String(sellerId) }) },
      payload,
    )
    const sellerOrders = await graphql({
      schema,
      contextValue: { req: sellerReq },
      source:
        '{ sellerOrderProducts { docs { orderId chainId quantity productId shippingAddress { addressLine1 } } } }',
    })
    expect(sellerOrders.errors).toBeUndefined()
    expect(sellerOrders.data).toMatchObject({
      sellerOrderProducts: { docs: [{ orderId: String(orderId), chainId: 8453, quantity: 2 }] },
    })
    expect((await findCheckoutSession(req, session.publicId)).orderRecordedAt).toBeTruthy()
  })

  it('does not complete an order from a pending session or a browser-supplied transaction hash', async () => {
    const req = await buyerRequest()
    const session = await createOrderCheckoutSession(req, String(orderId), wallet)
    expect((await verifyOrderCheckoutSession(req, session)).status).toBe('pending')
    await payload.update({
      collection: 'orders',
      id: String(orderId),
      overrideAccess: false,
      req,
      data: {
        paymentProofs: [
          { product: String(productId), chain: 'ethereum', transactionHash: `0x${'a'.repeat(64)}` },
        ],
      },
    })
    expect((await payload.findByID({ collection: 'orders', id: String(orderId) })).status).toBe(
      'processing',
    )
    expect(
      (await payload.findByID({ collection: 'products', id: String(productId) })).inventory,
    ).toBe(10)
    const provider = await providerRequest(payload, providerEvent(session.publicId, wallet))
    await acceptThirdwebPayment(provider.req, provider.body)
    expect((await payload.findByID({ collection: 'orders', id: String(orderId) })).status).toBe(
      'completed',
    )
  })

  it('does not let a destination transaction pay two different orders', async () => {
    const first = await createOrderCheckoutSession(await buyerRequest(), String(orderId), wallet)
    const provider = await providerRequest(payload, providerEvent(first.publicId, wallet))
    await acceptThirdwebPayment(provider.req, provider.body)
    const otherId = new Types.ObjectId()
    const original = await payload.db.collections.orders.collection.findOne({ _id: orderId })
    await payload.db.collections.orders.collection.insertOne({
      ...original,
      _id: otherId,
      status: 'processing',
      paymentProofs: [],
      transactions: [],
    })
    const second = await createOrderCheckoutSession(await buyerRequest(), String(otherId), wallet)
    const replay = await providerRequest(payload, providerEvent(second.publicId, wallet))
    await expect(acceptThirdwebPayment(replay.req, replay.body)).rejects.toThrow()
    expect((await payload.findByID({ collection: 'orders', id: String(otherId) })).status).toBe(
      'processing',
    )
    expect(
      (await payload.findByID({ collection: 'products', id: String(productId) })).inventory,
    ).toBe(8)
  })
})
