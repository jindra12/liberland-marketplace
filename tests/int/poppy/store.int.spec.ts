// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'
import {
  checkStore,
  checkReplayCache,
  StoreReplayCache,
} from '@datalayer/personal-agent-protocol/server'
import { createPayloadPoppyStore } from '@/poppy/store/utils'
import { POPPY_COLLECTION } from '@/poppy/constants'
import type { PoppyRecord } from '@/poppy/types'
import { createPoppyTestPayload, destroyPoppyTestPayload } from '../../poppy/payload/utils'

const holder: { payload?: Payload } = {}
const secret = 'test-only-secret-not-a-production-key'

describe('durable encrypted Poppy state', () => {
  beforeAll(async () => {
    holder.payload = await createPoppyTestPayload('store')
  })
  afterAll(async () => {
    if (holder.payload) {
      await destroyPoppyTestPayload(holder.payload)
    }
  })

  it('passes the SDK atomic store conformance tests against MongoDB', async () => {
    await checkStore(async () =>
      createPayloadPoppyStore(holder.payload!, `https://${randomUUID()}.example`, secret),
    )
  })

  it('passes the SDK replay-cache conformance tests against MongoDB', async () => {
    await checkReplayCache(() => {
      const store = createPayloadPoppyStore(
        holder.payload!,
        `https://${randomUUID()}.example`,
        secret,
      )
      return new StoreReplayCache(() => store)
    })
  })

  it('survives a new store instance without plaintext credentials and refuses a different encryption key', async () => {
    const first = createPayloadPoppyStore(holder.payload!, 'https://backend.example', secret)
    await first.put('grant', 'opaque-key', {
      refreshToken: 'test-refresh-secret',
      accountId: 'alice',
    })
    const serialized = JSON.stringify(
      await holder.payload!.db.find<PoppyRecord>({
        collection: POPPY_COLLECTION,
        where: { tenant: { equals: 'https://backend.example' } },
        pagination: false,
        limit: 0,
      }),
    )
    expect(serialized).not.toContain('test-refresh-secret')
    expect(serialized).not.toContain('opaque-key')
    const restored = createPayloadPoppyStore(holder.payload!, 'https://backend.example', secret)
    expect((await restored.get('grant', 'opaque-key'))?.value.accountId).toBe('alice')
    await expect(
      createPayloadPoppyStore(holder.payload!, 'https://backend.example', 'wrong-key').get(
        'grant',
        'opaque-key',
      ),
    ).rejects.toThrow()
    expect(
      await createPayloadPoppyStore(holder.payload!, 'https://other.example', secret).get(
        'grant',
        'opaque-key',
      ),
    ).toBeUndefined()
  })

  it('reads records written by the previous Mongo adapter without migrating grants', async () => {
    await holder
      .payload!.db.connection.db!.collection<
        Omit<PoppyRecord, 'id'> & { _id: string }
      >('poppy_protocol_state')
      .insertOne({
        _id: '6c1c732b32b4ce5397616c3642a914399983e202462b8240443a24bd1916b70b',
        tenant: 'https://legacy.example',
        kind: 'grant',
        version: 'legacy-version',
        value:
          'eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIiwia2lkIjoiNmMxYzczMmIzMmI0Y2U1Mzk3NjE2YzM2NDJhOTE0Mzk5OTgzZTIwMjQ2MmI4MjQwNDQzYTI0YmQxOTE2YjcwYiJ9..1nwdYLSc4xjyflfZ.AXAxTAjP5f2jbmdkKNaYYPK4KZgI_ka8EKwGz-ks0l1DFpZ_wFv5ssQeZASRgBw80QVzvcQROmMKmIt0HCM41jJDlQOiXxY.hbeZdAKNacShat0U_4QECQ',
      })
    const store = createPayloadPoppyStore(
      holder.payload!,
      'https://legacy.example',
      'poppy-payload-store-test-secret',
    )
    expect((await store.get('grant', 'old-refresh'))?.value.accountId).toBe('legacy-alice')
    expect(
      await store.replace('grant', 'old-refresh', 'legacy-version', { accountId: 'updated-alice' }),
    ).toBe(true)
    expect((await store.take('grant', 'old-refresh'))?.accountId).toBe('updated-alice')
    expect(await store.get('grant', 'old-refresh')).toBeUndefined()
  })

  it('keeps protocol records private and manages expiry cleanup on the existing collection', async () => {
    expect(holder.payload!.db.collections[POPPY_COLLECTION].collection.name).toBe(
      'poppy_protocol_state',
    )
    await expect(
      holder.payload!.find({ collection: POPPY_COLLECTION, overrideAccess: false }),
    ).rejects.toThrow()
    expect(holder.payload!.collections[POPPY_COLLECTION].config.endpoints).toBe(false)
    expect(holder.payload!.collections[POPPY_COLLECTION].config.graphQL).toBe(false)
    const indexes = await holder.payload!.db.collections[POPPY_COLLECTION].collection.indexes()
    expect(indexes.find((index) => index.key.expiresAt === 1)?.expireAfterSeconds).toBe(0)
  })
})
