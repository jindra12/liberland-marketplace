import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ObjectId } from 'mongodb'
import { createLocalReq } from 'payload'
import { createSearchReindexService, reindexSearch } from '@/search/reindex'
import { createMongoSecurityFixture } from './mongo/utils'

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
const companyIDs = [new ObjectId(), new ObjectId()]
beforeEach(async () => {
  await payload.db.collections.search.collection.deleteMany({})
  await payload.db.collections.companies.collection.deleteMany({})
  await payload.db.collections.companies.collection.insertMany(
    companyIDs.map((_id, index) => ({
      _id,
      name: `Search company ${index}`,
      _status: 'published',
      isPrivate: false,
    })),
  )
})

describe('Atomic standalone search replacement', () => {
  it('publishes a valid empty index when the last source records have been removed', async () => {
    await payload.db.collections.search.collection.insertOne({
      title: 'Stale entry',
      doc: { relationTo: 'companies', value: companyIDs[0] },
    })
    await payload.db.collections.companies.collection.deleteMany({})
    const counts = await reindexSearch(
      createSearchReindexService(await createLocalReq({}, payload)),
    )
    expect(counts.every((entry) => entry.count === 0)).toBe(true)
    expect(await payload.db.collections.search.collection.countDocuments({})).toBe(0)
    expect(
      (await payload.db.collections.search.collection.indexes()).some(
        (index) => index.name === '_id_',
      ),
    ).toBe(true)
  })

  it('keeps the live collection and cleans the staging collection when replacement inserts fail', async () => {
    await payload.db.collections.search.collection.insertOne({
      title: 'Still live',
      doc: { relationTo: 'companies', value: companyIDs[0] },
    })
    const insert = vi
      .spyOn(payload.db.connection.base.Model, 'insertMany')
      .mockRejectedValueOnce(new Error('Staging insert failed'))
    try {
      await expect(
        reindexSearch(createSearchReindexService(await createLocalReq({}, payload))),
      ).rejects.toThrow('Staging insert failed')
    } finally {
      insert.mockRestore()
    }
    const entries = await payload.db.collections.search.collection.find({}).toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0].title).toBe('Still live')
    const collections = await payload.db.connection
      .db!.listCollections({ name: /^search_rebuild_/ })
      .toArray()
    expect(collections).toHaveLength(0)
  })

  it('preserves the live index when replacement reads fail', async () => {
    await payload.db.collections.search.collection.insertOne({
      title: 'Existing search result',
      doc: { relationTo: 'companies', value: companyIDs[0] },
    })
    const req = await createLocalReq({}, payload)
    const read = vi
      .spyOn(payload, 'find')
      .mockRejectedValueOnce(new Error('Replacement read failed'))
    await expect(reindexSearch(createSearchReindexService(req))).rejects.toThrow(
      'Replacement read failed',
    )
    read.mockRestore()
    expect(await payload.db.collections.search.collection.find({}).toArray()).toEqual([
      expect.objectContaining({ title: 'Existing search result' }),
    ])
  })

  it('publishes simultaneous complete replacements without duplicates even when the original index is empty', async () => {
    const results = await Promise.allSettled(
      [1, 2].map(async () => {
        const req = await createLocalReq({}, payload)
        return reindexSearch(createSearchReindexService(req))
      }),
    )
    expect(
      results.map((result) => result.status),
      JSON.stringify(results),
    ).toEqual(['fulfilled', 'fulfilled'])
    const entries = await payload.db.collections.search.collection.find({}).toArray()
    expect(entries).toHaveLength(2)
    expect(entries.map((entry) => String(entry.doc.value)).sort()).toEqual(
      companyIDs.map(String).sort(),
    )
  })
})
