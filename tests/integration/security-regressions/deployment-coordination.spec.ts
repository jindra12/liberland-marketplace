import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { createLocalReq } from 'payload'
import { ventureDeploymentRecoveryEndpoints } from '@/endpoints/ventureDeploymentRecovery'
import { recoveryRecordSchema, recoveryActionSchema } from '@/venture/recoveryUtils'
import { createMongoSecurityFixture, synchronizeMongoWrites } from './mongo/utils'

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
const userId = new Types.ObjectId()
const ventureId = new Types.ObjectId()
const journalId = new Types.ObjectId()
const walletAddress = `0x${'1'.repeat(40)}`
const key = `${userId}:${ventureId}:${walletAddress}`
const runnerId = 'a21533e9-8195-43e8-9f87-1d6f77ddac1c'
const nextRunnerId = '44593b1b-268c-40c0-af2f-e7ec056236bb'
const record = recoveryRecordSchema.parse({
  values: {
    tokenName: 'Fixture',
    tokenSymbol: 'FIX',
    initialSupply: '21000000',
    tokensPerEth: '100',
    deploymentNetwork: 'ethereum',
    acknowledged: true,
  },
  runnerId,
  transactions: [{ label: 'token', hash: `0x${'a'.repeat(64)}` }],
  progress: [],
  manifest: null,
})

type RecoveryRecord = ReturnType<typeof recoveryRecordSchema.parse>
type RecoveryAction = ReturnType<typeof recoveryActionSchema.parse>

const request = async (
  method: 'post' | 'put' | 'delete',
  body?: RecoveryRecord | RecoveryAction,
) => {
  const user = await payload.findByID({ collection: 'users', id: userId.toHexString(), depth: 0 })
  const req = await createLocalReq({ user }, payload)
  req.routeParams = { id: ventureId.toHexString() }
  req.query = { walletAddress }
  req.json = async () => body
  return ventureDeploymentRecoveryEndpoints
    .find((endpoint) => endpoint.method === method)!
    .handler(req)
}

beforeEach(async () => {
  await payload.db.collections.users.collection.insertOne({
    _id: userId,
    email: 'owner@example.test',
    role: ['user'],
    emailVerified: true,
  })
  await payload.db.collections.identities.collection.insertOne({
    _id: ventureId,
    name: 'Fixture tribe',
    _status: 'published',
  })
  await payload.db.collections.companies.collection.insertOne({
    _id: ventureId,
    name: 'Fixture company',
    createdBy: userId,
    isPrivate: false,
    _status: 'published',
  })
  await payload.db.collections.startups.collection.insertOne({
    _id: ventureId,
    title: 'Fixture venture',
    createdBy: userId,
    company: ventureId,
    identity: ventureId,
    _status: 'published',
  })
  await payload.db.collections['venture-deployment-recoveries'].collection.insertOne({
    _id: journalId,
    key,
    record,
    revision: 0,
  })
})

afterEach(async () => {
  await Promise.all(
    ['users', 'startups', 'companies', 'identities', 'venture-deployment-recoveries'].map(
      (collection) => payload.db.collections[collection].deleteMany({}),
    ),
  )
  await Promise.all(Object.values(payload.db.versions).map((model) => model.deleteMany({})))
})

describe('Persisted deployment ownership and archival', () => {
  it('retains both owner registrations during concurrent saves and rejects a rewrite of an existing contract', async () => {
    const user = await payload.findByID({ collection: 'users', id: userId.toHexString(), depth: 0 })
    const deployments = ['1', '2'].map((digit) => ({
      id: new Types.ObjectId().toHexString(),
      chain: 'ethereum' as const,
      chainId: '1',
      tokenAddress: `0x${digit.repeat(40)}`,
    }))
    const release = synchronizeMongoWrites(payload, 'startups', ventureId.toHexString())
    try {
      await Promise.all(
        deployments.map(async (deployment) =>
          payload.update({
            collection: 'startups',
            id: ventureId.toHexString(),
            data: { contractDeployments: [deployment] },
            user,
            overrideAccess: false,
            req: await createLocalReq({ user }, payload),
          }),
        ),
      )
    } finally {
      release()
    }
    const stored = await payload.findByID({
      collection: 'startups',
      id: ventureId.toHexString(),
      depth: 0,
    })
    expect(stored.contractDeployments?.map((deployment) => deployment.tokenAddress).sort()).toEqual(
      deployments.map((deployment) => deployment.tokenAddress).sort(),
    )
    await expect(
      payload.update({
        collection: 'startups',
        id: ventureId.toHexString(),
        data: { contractDeployments: [{ ...deployments[0], tokenAddress: `0x${'3'.repeat(40)}` }] },
        user,
        overrideAccess: false,
        req: await createLocalReq({ user }, payload),
      }),
    ).rejects.toThrow('A saved deployment cannot be overwritten')
    const retained = await payload.findByID({
      collection: 'startups',
      id: ventureId.toHexString(),
      depth: 0,
    })
    expect(retained.contractDeployments).toEqual(stored.contractDeployments)
    await payload.update({
      collection: 'startups', id: ventureId.toHexString(),
      data: { contractDeployments: [{ chain: 'ethereum', chainId: '1', tokenAddress: deployments[0].tokenAddress }] },
      user, overrideAccess: false, req: await createLocalReq({ user }, payload),
    })
    const retried = await payload.findByID({ collection: 'startups', id: ventureId.toHexString(), depth: 0 })
    expect(retried.contractDeployments).toEqual(stored.contractDeployments)
  })

  it('allows only one simultaneous takeover and rejects the previous runner checkpoints', async () => {
    const release = synchronizeMongoWrites(
      payload,
      'venture-deployment-recoveries',
      journalId.toHexString(),
    )
    try {
      const responses = await Promise.all(
        [nextRunnerId, '39707332-c23e-4c36-8bb1-2e32600c2ed3'].map((candidate) =>
          request('post', { action: 'takeover', confirmed: true, record, runnerId: candidate }),
        ),
      )
      expect(responses.map((response) => response.status).sort()).toEqual([200, 409])
      expect((await request('put', record)).status).toBe(409)
      const stored = await payload.findByID({
        collection: 'venture-deployment-recoveries',
        id: journalId.toHexString(),
        depth: 0,
      })
      const actual = recoveryRecordSchema.parse(stored.record)
      expect(actual.runnerId).not.toBe(runnerId)
      expect(actual.transactions).toEqual(record.transactions)
    } finally {
      release()
    }
  })

  it('rejects a stale takeover confirmation after another checkpoint was persisted', async () => {
    expect((await request('put', { ...record, progress: record.transactions })).status).toBe(200)
    expect(
      (
        await request('post', {
          action: 'takeover',
          confirmed: true,
          record,
          runnerId: nextRunnerId,
        })
      ).status,
    ).toBe(409)
    const stored = await payload.findByID({
      collection: 'venture-deployment-recoveries',
      id: journalId.toHexString(),
      depth: 0,
    })
    expect(recoveryRecordSchema.parse(stored.record)).toMatchObject({
      runnerId,
      progress: record.transactions,
    })
  })

  it('archives the full journal, forbids retired runner replay, and lets a new deployment start independently', async () => {
    expect((await request('delete')).status).toBe(409)
    expect(
      (await request('post', { action: 'abandon', confirmed: true, record, runnerId })).status,
    ).toBe(200)
    const archived = await payload.findByID({
      collection: 'venture-deployment-recoveries',
      id: journalId.toHexString(),
      depth: 0,
    })
    expect(archived.key).toBe(`${key}:archived:${runnerId}`)
    expect(recoveryRecordSchema.parse(archived.record).transactions).toEqual(record.transactions)
    expect((await request('put', record)).status).toBe(409)
    const fresh = { ...record, runnerId: nextRunnerId, transactions: [], progress: [] }
    expect((await request('put', fresh)).status).toBe(200)
    expect((await request('put', record)).status).toBe(409)
    const active = await payload.find({
      collection: 'venture-deployment-recoveries',
      where: { key: { equals: key } },
      depth: 0,
    })
    expect(active.docs).toHaveLength(1)
    expect(recoveryRecordSchema.parse(active.docs[0].record)).toEqual(fresh)
  })
})
