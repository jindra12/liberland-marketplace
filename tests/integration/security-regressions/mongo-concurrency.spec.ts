import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { createLocalReq } from 'payload'
import { graphql } from 'graphql'
import { mock } from 'vitest-mock-extended'
import { ventureDeploymentRecoveryEndpoints } from '@/endpoints/ventureDeploymentRecovery'
import { recoveryRecordSchema } from '@/venture/recoveryUtils'
import { createMembershipSchema } from '../../unit/security-regressions/membership/utils'
import { getSellerOrderProducts } from '@/graphql/sellerOrders'
import { recordPaymentSettlements } from '@/crypto/settlements/utils'
import { applyOrderPurchaseCounts } from '@/hooks/updateProductPurchaseCount'
import {
  createMongoSecurityFixture,
  synchronizeMongoReads,
  synchronizeMongoWrites,
  createPersistedFulfillmentSchema,
} from './mongo/utils'

vi.mock('@/utilities/sendAuthEmail', () => ({ sendAuthEmail: vi.fn() }))
vi.mock('@payloadcms/email-nodemailer', () => ({
  nodemailerAdapter: async () => () => ({
    name: 'security-test-email',
    defaultFromAddress: 'unit@example.test',
    defaultFromName: 'Unit tests',
    sendEmail: vi.fn(),
  }),
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

const payload = await createMongoSecurityFixture()
const sellerId = new Types.ObjectId()
const companyId = new Types.ObjectId()
const productIds = [new Types.ObjectId(), new Types.ObjectId()]
const orderId = new Types.ObjectId()
const proofIds = [new Types.ObjectId(), new Types.ObjectId()]

beforeEach(async () => {
  await payload.db.collections.users.collection.insertOne({
    _id: sellerId,
    email: 'seller@example.test',
    role: ['admin'],
  })
  await payload.db.collections.companies.collection.insertOne({
    _id: companyId,
    name: 'Fixture company',
    isPrivate: false,
    createdBy: sellerId,
    _status: 'published',
  })
  await payload.db.collections.products.collection.insertMany(
    productIds.map((_id) => ({
      _id,
      name: 'Fixture product',
      company: companyId,
      createdBy: sellerId,
      _status: 'published',
      inventory: 10,
      unlimitedInventory: false,
    })),
  )
  await payload.db.collections.orders.collection.insertOne({
    _id: orderId,
    status: 'completed',
    customer: sellerId,
    createdAt: new Date(),
    items: productIds.map((product) => ({ product, quantity: 2 })),
    paymentProofs: productIds.map((product, index) => ({
      id: proofIds[index].toHexString(),
      product,
      chain: 'ethereum',
      transactionHash: `0x${String(index + 1).repeat(64)}`,
      fulfilled: false,
      rejected: false,
    })),
  })
})

// Each test owns the entire disposable database, not a shared application database.
afterEach(async () => {
  await Promise.all(
    [
      'users',
      'companies',
      'products',
      'orders',
      'startups',
      'venture-deployment-recoveries',
      'payment-settlements',
    ].map((name) => payload.db.collections[name].deleteMany({})),
  )
  await Promise.all(Object.values(payload.db.versions).map((model) => model.deleteMany({})))
})

describe('Persisted commerce concurrency', () => {
  it('resumes counting when completion persisted but the first after-change handler was interrupted', async () => {
    await payload.db.collections.orders.updateOne({ _id: orderId }, { status: 'processing' })
    const user = await payload.findByID({
      collection: 'users',
      id: sellerId.toHexString(),
      depth: 0,
    })
    const complete = async () =>
      payload.update({
        collection: 'orders',
        id: orderId.toHexString(),
        data: { status: 'completed' },
        req: await createLocalReq({ user }, payload),
        context: { skipAutoOrderCryptoConfirm: true },
      })
    const failure: import('payload').CollectionAfterChangeHook = () => {
      throw new Error('Interrupted after completion persisted')
    }
    const hooks = payload.collections.orders.config.hooks.afterChange
    hooks.unshift(failure)
    try {
      await expect(complete()).rejects.toThrow('Interrupted after completion persisted')
    } finally {
      hooks.splice(hooks.indexOf(failure), 1)
    }
    const pending = await payload.db.collections.orders.collection.findOne({ _id: orderId })
    expect(pending?.status).toBe('completed')
    expect(pending?.purchaseCountStartedAt).toBeTruthy()
    await complete()
    const products = await payload.find({
      collection: 'products',
      where: { id: { in: productIds.map(String) } },
      depth: 0,
    })
    expect(products.docs.map((product) => product.purchaseCount)).toEqual([2, 2])
  })

  it('does not recount a historical completed order without new application markers when it is edited', async () => {
    await payload.db.collections.products.updateOne({ _id: productIds[0] }, { purchaseCount: 5 })
    const user = await payload.findByID({
      collection: 'users',
      id: sellerId.toHexString(),
      depth: 0,
    })
    await payload.update({
      collection: 'orders',
      id: orderId.toHexString(),
      data: { status: 'completed' },
      req: await createLocalReq({ user }, payload),
      context: { skipAutoOrderCryptoConfirm: true },
    })
    const product = await payload.findByID({
      collection: 'products',
      id: productIds[0].toHexString(),
      depth: 0,
    })
    expect(product.purchaseCount).toBe(5)
    const order = await payload.db.collections.orders.collection.findOne({ _id: orderId })
    expect(order?.purchaseCountStartedAt).toBeFalsy()
  })

  it('preserves an unpublished product edit while operational counters update the published record', async () => {
    const user = await payload.findByID({
      collection: 'users',
      id: sellerId.toHexString(),
      depth: 0,
    })
    const req = await createLocalReq({ user }, payload)
    await payload.update({
      collection: 'products',
      id: productIds[0].toHexString(),
      data: { name: 'Unpublished product edit' },
      draft: true,
      req,
    })
    await applyOrderPurchaseCounts(orderId.toHexString(), req)
    const published = await payload.findByID({
      collection: 'products',
      id: productIds[0].toHexString(),
      draft: false,
      depth: 0,
      req,
    })
    const draft = await payload.findByID({
      collection: 'products',
      id: productIds[0].toHexString(),
      draft: true,
      depth: 0,
      req,
    })
    expect(published.name).toBe('Fixture product')
    expect(published.purchaseCount).toBe(2)
    expect(draft.name).toBe('Unpublished product edit')
    expect(draft.purchaseCount).toBe(2)
  })

  it('recovers purchase counts after a persisted first-line increment loses its version write', async () => {
    const req = await createLocalReq({}, payload)
    const version = vi
      .spyOn(payload.db, 'createVersion')
      .mockRejectedValueOnce(new Error('Interrupted version write'))
    await expect(applyOrderPurchaseCounts(orderId.toHexString(), req)).rejects.toThrow(
      'Interrupted version write',
    )
    version.mockRestore()
    const owner = await payload.findByID({
      collection: 'users',
      id: sellerId.toHexString(),
      depth: 0,
    })
    await payload.update({
      collection: 'products',
      id: productIds[0].toHexString(),
      overrideAccess: false,
      req: await createLocalReq({ user: owner }, payload),
      data: {
        purchaseApplications: [],
        purchaseCount: 0,
        operationalUpdatedAt: '2000-01-01T00:00:00.000Z',
      },
    })
    await payload.update({
      collection: 'orders',
      id: orderId.toHexString(),
      data: { status: 'completed' },
      req: await createLocalReq({ user: owner }, payload),
      context: { skipAutoOrderCryptoConfirm: true },
    })
    await applyOrderPurchaseCounts(orderId.toHexString(), await createLocalReq({}, payload))
    const products = await payload.find({
      collection: 'products',
      where: { id: { in: productIds.map(String) } },
      depth: 0,
    })
    expect(products.docs.map((product) => product.purchaseCount)).toEqual([2, 2])
    const stored = await payload.db.collections.orders.collection.findOne({ _id: orderId })
    expect(stored?.purchaseCountAppliedAt).toBeTruthy()
  })

  it('recovers a partially applied inventory order without rededucting the persisted first line', async () => {
    const user = await payload.findByID({
      collection: 'users',
      id: sellerId.toHexString(),
      depth: 0,
    })
    vi.spyOn(payload, 'auth').mockResolvedValue(
      mock<Awaited<ReturnType<typeof payload.auth>>>({ user }),
    )
    const { POST } = await import('@/app/api/orders/[id]/update-inventory/route')
    const deduct = () =>
      POST(
        new Request(`https://backend.example/api/orders/${orderId}/update-inventory`, {
          method: 'POST',
        }),
      )
    const version = vi
      .spyOn(payload.db, 'createVersion')
      .mockRejectedValueOnce(new Error('Interrupted inventory version'))
    expect((await deduct()).status).toBe(500)
    version.mockRestore()
    await payload.update({
      collection: 'products',
      id: productIds[0].toHexString(),
      overrideAccess: false,
      req: await createLocalReq({ user }, payload),
      data: { inventoryApplications: [], operationalUpdatedAt: '2000-01-01T00:00:00.000Z' },
    })
    expect((await deduct()).status).toBe(200)
    expect((await deduct()).status).toBe(200)
    const products = await payload.find({
      collection: 'products',
      where: { id: { in: productIds.map(String) } },
      depth: 0,
    })
    expect(products.docs.map((product) => product.inventory)).toEqual([8, 8])
  })

  it('deducts the same order only once when duplicate requests reach the database together', async () => {
    const user = await payload.findByID({
      collection: 'users',
      id: sellerId.toHexString(),
      depth: 0,
    })
    vi.spyOn(payload, 'auth').mockResolvedValue(
      mock<Awaited<ReturnType<typeof payload.auth>>>({ user }),
    )
    const { POST } = await import('@/app/api/orders/[id]/update-inventory/route')
    const release = synchronizeMongoWrites(payload, 'products', productIds[0].toHexString())
    try {
      const results = await Promise.all(
        [1, 2].map(() =>
          POST(
            new Request(`https://backend.example/api/orders/${orderId}/update-inventory`, {
              method: 'POST',
            }),
          ),
        ),
      )
      expect(results.map((response) => response.status)).toEqual([200, 200])
      const products = await payload.find({
        collection: 'products',
        where: { id: { in: productIds.map(String) } },
        depth: 0,
      })
      expect(products.docs.map((product) => product.inventory)).toEqual([8, 8])
    } finally {
      release()
    }
  })
  it('allows only one order to claim a verified payment and preserves that ownership through interrupted retries', async () => {
    const otherID = new Types.ObjectId()
    await payload.db.collections.orders.collection.insertOne({
      _id: otherID,
      status: 'processing',
      customer: sellerId,
    })
    const user = await payload.findByID({
      collection: 'users',
      id: sellerId.toHexString(),
      depth: 0,
    })
    const proof = {
      product: productIds[0].toHexString(),
      chain: 'ethereum' as const,
      transactionHash: `0x${'a'.repeat(64)}`,
    }
    const results = await Promise.allSettled(
      [orderId, otherID].map(async (id) => {
        const req = await createLocalReq({ user }, payload)
        return recordPaymentSettlements(req, id.toHexString(), [proof])
      }),
    )
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(await payload.count({ collection: 'payment-settlements' })).toMatchObject({
      totalDocs: 1,
    })
    const abortReq = await createLocalReq({ user }, payload)
    const abortProof = { ...proof, transactionHash: `0x${'b'.repeat(64)}` }
    await recordPaymentSettlements(abortReq, otherID.toHexString(), [abortProof])
    const retryReq = await createLocalReq({ user }, payload)
    await expect(
      recordPaymentSettlements(retryReq, orderId.toHexString(), [abortProof]),
    ).rejects.toMatchObject({ status: 409 })
    await recordPaymentSettlements(retryReq, otherID.toHexString(), [abortProof])
    expect(await payload.count({ collection: 'payment-settlements' })).toMatchObject({
      totalDocs: 2,
    })
  })
  it('counts purchased quantities once even after a completed order is reopened and completed again', async () => {
    await payload.db.collections.products.updateOne({ _id: productIds[0] }, { purchaseCount: 5 })
    await payload.db.collections.orders.updateOne(
      { _id: orderId },
      {
        status: 'processing',
        items: [{ product: productIds[0], quantity: 3 }],
      },
    )
    const user = await payload.findByID({
      collection: 'users',
      id: sellerId.toHexString(),
      depth: 0,
    })
    const req = await createLocalReq({ user }, payload)
    const complete = () =>
      payload.update({
        collection: 'orders',
        id: orderId.toHexString(),
        data: { status: 'completed' },
        req,
        context: { skipAutoOrderCryptoConfirm: true },
      })
    await complete()
    expect(
      (
        await payload.findByID({
          collection: 'products',
          id: productIds[0].toHexString(),
          depth: 0,
        })
      ).purchaseCount,
    ).toBe(8)
    await payload.update({
      collection: 'orders',
      id: orderId.toHexString(),
      data: { status: 'processing' },
      req,
    })
    await complete()
    expect(
      (
        await payload.findByID({
          collection: 'products',
          id: productIds[0].toHexString(),
          depth: 0,
        })
      ).purchaseCount,
    ).toBe(8)
  })

  it('retains purchased units when separate orders complete concurrently', async () => {
    const otherID = new Types.ObjectId()
    await payload.db.collections.products.updateOne({ _id: productIds[0] }, { purchaseCount: 5 })
    await payload.db.collections.orders.updateOne(
      { _id: orderId },
      { status: 'processing', items: [{ product: productIds[0], quantity: 1 }] },
    )
    await payload.db.collections.orders.collection.insertOne({
      _id: otherID,
      status: 'processing',
      customer: sellerId,
      items: [{ product: productIds[0], quantity: 1 }],
    })
    const user = await payload.findByID({
      collection: 'users',
      id: sellerId.toHexString(),
      depth: 0,
    })
    await Promise.all(
      [orderId, otherID].map(async (id) => {
        const req = await createLocalReq({ user }, payload)
        return payload.update({
          collection: 'orders',
          id: id.toHexString(),
          data: { status: 'completed' },
          req,
          context: { skipAutoOrderCryptoConfirm: true },
        })
      }),
    )
    expect(
      (
        await payload.findByID({
          collection: 'products',
          id: productIds[0].toHexString(),
          depth: 0,
        })
      ).purchaseCount,
    ).toBe(7)
  })

  it('loads only ordered products instead of the seller catalog when listing orders', async () => {
    await payload.db.collections.products.collection.insertMany(
      Array.from({ length: 150 }, (_, index) => ({
        _id: new Types.ObjectId(),
        name: `Unordered product ${index}`,
        createdBy: sellerId,
        company: companyId,
        _status: 'published',
      })),
    )
    const user = await payload.findByID({
      collection: 'users',
      id: sellerId.toHexString(),
      depth: 0,
    })
    const req = await createLocalReq({ user }, payload)
    const reads = vi.spyOn(payload, 'find')
    const result = await getSellerOrderProducts({ req, limit: 10, page: 1 })
    expect(result.docs).toHaveLength(2)
    const productReads = reads.mock.calls
      .map(([options]) => options)
      .filter((options) => options.collection === 'products')
    expect(productReads).toHaveLength(1)
    expect(productReads[0]).toMatchObject({
      limit: 100,
      pagination: true,
      where: {
        and: expect.arrayContaining([{ id: { in: productIds.map((id) => id.toHexString()) } }]),
      },
    })
    reads.mockRestore()
  })

  it.each(['joinStartup', 'leaveStartup'])(
    '%s retains concurrent members in both the current record and its latest version',
    async (operation) => {
      const ventureID = new Types.ObjectId()
      const identityID = new Types.ObjectId()
      const members = [new Types.ObjectId(), new Types.ObjectId()]
      await payload.db.collections.identities.collection.insertOne({
        _id: identityID,
        name: 'Member tribe',
      })
      await payload.db.collections.users.collection.insertMany(
        members.map((_id, index) => ({
          _id,
          name: `Member ${index}`,
          email: `member${index}@example.test`,
          emailVerified: true,
          role: ['user'],
        })),
      )
      await payload.db.collections.startups.collection.insertOne({
        _id: ventureID,
        title: 'Member venture',
        stage: 'idea',
        company: companyId,
        identity: identityID,
        createdBy: sellerId,
        _status: 'published',
        involvedUsers: operation === 'leaveStartup' ? members : [],
      })
      const release = synchronizeMongoWrites(payload, 'startups', ventureID.toHexString())
      try {
        const schema = createMembershipSchema()
        const results = await Promise.all(
          members.map(async (id) => {
            const user = await payload.findByID({
              collection: 'users',
              id: id.toHexString(),
              depth: 0,
            })
            const req = await createLocalReq({ user }, payload)
            return graphql({
              schema,
              source: `mutation { ${operation}(id: "${ventureID}") { startup { id } } }`,
              contextValue: { req },
            })
          }),
        )
        expect(
          results.map((result) => result.errors),
          JSON.stringify(results),
        ).toEqual([undefined, undefined])
        const stored = await payload.findByID({
          collection: 'startups',
          id: ventureID.toHexString(),
          depth: 0,
        })
        expect(stored.involvedUsers).toHaveLength(operation === 'joinStartup' ? 2 : 0)
        const versions = await payload.findVersions({
          collection: 'startups',
          where: { parent: { equals: ventureID.toHexString() } },
          sort: '-updatedAt',
          limit: 1,
          depth: 0,
        })
        expect(versions.docs[0].version.involvedUsers).toHaveLength(
          operation === 'joinStartup' ? 2 : 0,
        )
      } finally {
        release()
      }
    },
  )

  it.each(['processing', 'cancelled', 'refunded'] as const)(
    'rejects fulfillment of a %s order without changing persisted seller flags',
    async (status) => {
      await payload.db.collections.orders.updateOne({ _id: orderId }, { status })
      const user = await payload.findByID({ collection: 'users', id: sellerId.toHexString(), depth: 0 })
      const result = await graphql({
        schema: createPersistedFulfillmentSchema(),
        source: 'mutation Fulfill($orderId: String!, $paymentProofId: String!) { updateSellerOrderProductFulfilled(orderId: $orderId, paymentProofId: $paymentProofId, fulfilled: true) { fulfilled } }',
        variableValues: { orderId: orderId.toHexString(), paymentProofId: proofIds[0].toHexString() },
        contextValue: { req: await createLocalReq({ user }, payload) },
      })
      expect(result.errors?.[0].message).toContain('verified completed order')
      const stored = await payload.db.collections.orders.collection.findOne({ _id: orderId })
      expect(stored?.paymentProofs.every((proof: { fulfilled: boolean }) => !proof.fulfilled)).toBe(true)
    },
  )

  it('retains both seller proof updates in Mongo when two fulfillment operations overlap', async () => {
    const user = await payload.findByID({
      collection: 'users',
      id: sellerId.toHexString(),
      depth: 0,
    })
    const release = synchronizeMongoWrites(payload, 'orders', orderId.toHexString())
    try {
      const schema = createPersistedFulfillmentSchema()
      const results = await Promise.all(
        proofIds.map(async (id) =>
          graphql({
            schema,
            source:
              'mutation Fulfill($orderId: String!, $paymentProofId: String!) { updateSellerOrderProductFulfilled(orderId: $orderId, paymentProofId: $paymentProofId, fulfilled: true) { fulfilled } }',
            variableValues: { orderId: orderId.toHexString(), paymentProofId: id.toHexString() },
            contextValue: { req: await createLocalReq({ user }, payload) },
          }),
        ),
      )
      expect(
        results.map((result) => result.errors),
        JSON.stringify(results),
      ).toEqual([undefined, undefined])
      const stored = await payload.findByID({
        collection: 'orders',
        id: orderId.toHexString(),
        depth: 0,
      })
      expect(stored.paymentProofs?.filter((proof) => proof.fulfilled)).toHaveLength(2)
    } finally {
      release()
    }
  })

  it('does not deduct persisted inventory again when a completed order is retried', async () => {
    const user = await payload.findByID({
      collection: 'users',
      id: sellerId.toHexString(),
      depth: 0,
    })
    vi.spyOn(payload, 'auth').mockResolvedValue(
      mock<Awaited<ReturnType<typeof payload.auth>>>({ user }),
    )
    const { POST } = await import('@/app/api/orders/[id]/update-inventory/route')
    const first = await POST(
      new Request(`https://backend.example/api/orders/${orderId}/update-inventory`, {
        method: 'POST',
      }),
    )
    const second = await POST(
      new Request(`https://backend.example/api/orders/${orderId}/update-inventory`, {
        method: 'POST',
      }),
    )
    const responses = [first, second]
    expect(
      await Promise.all(
        responses.map(async (response) => ({
          status: response.status,
          body: await response.json(),
        })),
      ),
    ).toEqual([expect.objectContaining({ status: 200 }), expect.objectContaining({ status: 200 })])
    const stored = await payload.findByID({
      collection: 'products',
      id: productIds[0].toHexString(),
      depth: 0,
    })
    expect(stored.inventory).toBe(8)
  })

  it('retains both stock deductions when two distinct completed orders overlap in Mongo', async () => {
    const otherId = new Types.ObjectId()
    await payload.db.collections.orders.collection.insertOne({
      _id: otherId,
      status: 'completed',
      customer: sellerId,
      items: [{ product: productIds[0], quantity: 2 }],
    })
    const user = await payload.findByID({
      collection: 'users',
      id: sellerId.toHexString(),
      depth: 0,
    })
    vi.spyOn(payload, 'auth').mockResolvedValue(
      mock<Awaited<ReturnType<typeof payload.auth>>>({ user }),
    )
    const { POST } = await import('@/app/api/orders/[id]/update-inventory/route')
    const release = synchronizeMongoWrites(payload, 'products', productIds[0].toHexString())
    try {
      const responses = await Promise.all(
        [orderId, otherId].map(async (id) =>
          POST(
            new Request(`https://backend.example/api/orders/${id}/update-inventory`, {
              method: 'POST',
            }),
          ),
        ),
      )
      const outcomes = await Promise.all(
        responses.map(async (response) => ({
          status: response.status,
          body: await response.json(),
        })),
      )
      expect(outcomes, JSON.stringify(outcomes)).toEqual([
        expect.objectContaining({ status: 200 }),
        expect.objectContaining({ status: 200 }),
      ])
      const stored = await payload.findByID({
        collection: 'products',
        id: productIds[0].toHexString(),
        depth: 0,
      })
      expect(stored.inventory).toBe(6)
    } finally {
      release()
    }
  })

  it('preserves an independently saved deployment when a second device submits an older deployment list', async () => {
    const ventureId = new Types.ObjectId()
    const original = { id: new Types.ObjectId().toHexString(), chain: 'ethereum' as const, chainId: '1', tokenAddress: `0x${'1'.repeat(40)}` }
    const second = { ...original, id: new Types.ObjectId().toHexString(), tokenAddress: `0x${'2'.repeat(40)}` }
    const third = { ...original, id: new Types.ObjectId().toHexString(), tokenAddress: `0x${'3'.repeat(40)}` }
    await payload.db.collections.identities.collection.insertOne({ _id: ventureId, name: 'Deployment tribe', _status: 'published' })
    await payload.db.collections.startups.collection.insertOne({
      _id: ventureId, title: 'Deployment fixture', createdBy: sellerId, company: companyId, identity: ventureId, _status: 'published', contractDeployments: [original],
    })
    await payload.update({ collection: 'startups', id: ventureId.toHexString(), data: { contractDeployments: [original, second] } })
    await payload.update({ collection: 'startups', id: ventureId.toHexString(), data: { contractDeployments: [original, third] } })
    const stored = await payload.db.collections.startups.collection.findOne({ _id: ventureId })
    expect(stored?.contractDeployments.map((deployment: { tokenAddress: string }) => deployment.tokenAddress))
      .toEqual(expect.arrayContaining([original.tokenAddress, second.tokenAddress, third.tokenAddress]))
    expect(stored?.contractDeployments).toHaveLength(3)
  })

  it('retains concurrent device checkpoints or rejects the stale recovery writer', async () => {
    const ventureId = new Types.ObjectId()
    const journalId = new Types.ObjectId()
    const walletAddress = '0x1111111111111111111111111111111111111111'
    const record = recoveryRecordSchema.parse({
      runnerId: 'a21533e9-8195-43e8-9f87-1d6f77ddac1c',
      values: {
        tokenName: 'Fixture',
        tokenSymbol: 'FIX',
        initialSupply: '21000000',
        tokensPerEth: '100',
        deploymentNetwork: 'ethereum',
        acknowledged: true,
      },
      transactions: [],
      progress: [],
      manifest: null,
      saved: false,
    })
    await payload.db.collections.startups.collection.insertOne({
      _id: ventureId,
      title: 'Fixture venture',
      createdBy: sellerId,
      _status: 'published',
    })
    await payload.db.collections['venture-deployment-recoveries'].collection.insertOne({
      _id: journalId,
      key: `${sellerId}:${ventureId}:${walletAddress}`,
      record,
    })
    const release = synchronizeMongoReads(
      payload,
      'venture-deployment-recoveries',
      journalId.toHexString(),
    )
    try {
      const user = await payload.findByID({
        collection: 'users',
        id: sellerId.toHexString(),
        depth: 0,
      })
      const endpoint = ventureDeploymentRecoveryEndpoints.find((entry) => entry.method === 'put')!
      const responses = await Promise.all(
        ['token', 'dao'].map(async (label, index) => {
          const req = await createLocalReq({ user }, payload)
          req.routeParams = { id: ventureId.toHexString() }
          req.query = { walletAddress }
          req.json = async () => ({
            ...record,
            transactions: [{ label, hash: `0x${String(index + 1).repeat(64)}` }],
          })
          return endpoint.handler(req)
        }),
      )
      expect(
        responses.map((response) => response.status).every((status) => [200, 409].includes(status)),
      ).toBe(true)
      const stored = await payload.findByID({
        collection: 'venture-deployment-recoveries',
        id: journalId.toHexString(),
        depth: 0,
      })
      expect(recoveryRecordSchema.parse(stored.record).transactions).toHaveLength(
        responses.some((response) => response.status === 409) ? 1 : 2,
      )
      const staleReq = await createLocalReq({ user }, payload)
      staleReq.routeParams = { id: ventureId.toHexString() }
      staleReq.query = { walletAddress }
      staleReq.json = async () => record
      const staleSave = await endpoint.handler(staleReq)
      expect(staleSave.status).toBe(200)
      const retained = await payload.findByID({
        collection: 'venture-deployment-recoveries',
        id: journalId.toHexString(),
        depth: 0,
      })
      expect(recoveryRecordSchema.parse(retained.record).transactions).toEqual(
        recoveryRecordSchema.parse(stored.record).transactions,
      )
      const previousStep = recoveryRecordSchema.parse(retained.record).transactions[0]
      const replacement = {
        ...previousStep,
        hash: `0x${'3'.repeat(64)}`,
        nonce: 7,
        chainId: '31337',
        submittedAtBlock: 10,
      }
      staleReq.json = async () => ({ ...record, transactions: [previousStep, replacement] })
      expect((await endpoint.handler(staleReq)).status).toBe(200)
      staleReq.json = async () => ({ ...record, transactions: [previousStep] })
      expect((await endpoint.handler(staleReq)).status).toBe(200)
      const replaced = await payload.findByID({
        collection: 'venture-deployment-recoveries',
        id: journalId.toHexString(),
        depth: 0,
      })
      expect(recoveryRecordSchema.parse(replaced.record).transactions).toEqual([
        previousStep,
        replacement,
      ])
      staleReq.json = async () => ({ ...record, saved: true })
      expect((await endpoint.handler(staleReq)).status).toBe(400)
      staleReq.json = async () => ({
        ...record,
        values: { ...record.values, tokenName: 'Another deployment' },
      })
      expect((await endpoint.handler(staleReq)).status).toBe(409)
    } finally {
      release()
    }
  })
})
