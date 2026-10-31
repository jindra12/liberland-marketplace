// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MongoClient } from 'mongodb'
import { randomUUID } from 'node:crypto'
import {
  checkStore,
  checkReplayCache,
  StoreReplayCache,
} from '@datalayer/personal-agent-protocol/server'
import { createMongoPoppyStore, ensurePoppyIndexes } from '@/poppy/store/utils'
import type { PoppyRecord } from '@/poppy/types'

const client = new MongoClient('mongodb://127.0.0.1:27018')
const database = client.db(`poppy_store_test_${randomUUID()}`)
const secret = 'test-only-secret-not-a-production-key'
const collection = () => database.collection<PoppyRecord>(`state_${randomUUID()}`)

describe('durable encrypted Poppy state', () => {
  beforeAll(async () => {
    await client.connect()
  })
  afterAll(async () => {
    await database.dropDatabase()
    await client.close()
  })

  it('passes the SDK atomic store conformance tests against MongoDB', async () => {
    await checkStore(async () => {
      const records = collection()
      await ensurePoppyIndexes(records)
      return createMongoPoppyStore(records, 'https://backend.example', secret)
    })
  })

  it('passes the SDK replay-cache conformance tests against MongoDB', async () => {
    await checkReplayCache(() => {
      const store = createMongoPoppyStore(collection(), 'https://backend.example', secret)
      return new StoreReplayCache(() => store)
    })
  })

  it('survives a new store instance without plaintext credentials and refuses a different encryption key', async () => {
    const records = collection()
    const first = createMongoPoppyStore(records, 'https://backend.example', secret)
    await first.put('grant', 'opaque-key', {
      refreshToken: 'test-refresh-secret',
      accountId: 'alice',
    })
    const serialized = JSON.stringify(await records.findOne({}))
    expect(serialized).not.toContain('test-refresh-secret')
    expect(serialized).not.toContain('opaque-key')
    const restored = createMongoPoppyStore(records, 'https://backend.example', secret)
    expect((await restored.get('grant', 'opaque-key'))?.value.accountId).toBe('alice')
    await expect(
      createMongoPoppyStore(records, 'https://backend.example', 'wrong-key').get(
        'grant',
        'opaque-key',
      ),
    ).rejects.toThrow()
    expect(
      await createMongoPoppyStore(records, 'https://other.example', secret).get(
        'grant',
        'opaque-key',
      ),
    ).toBeUndefined()
  })
})
