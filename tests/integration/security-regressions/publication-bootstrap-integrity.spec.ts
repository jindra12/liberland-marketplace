import { describe, expect, it, vi } from 'vitest'
import { ObjectId } from 'mongodb'
import { createLocalReq, type CollectionBeforeChangeHook } from 'payload'
import { createMongoSecurityFixture } from './mongo/utils'

vi.mock('@/utilities/sendAuthEmail', () => ({ sendAuthEmail: vi.fn() }))
vi.mock('next/cache', async (original) => ({
  ...(await original<typeof import('next/cache')>()),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))
vi.mock('@payloadcms/email-nodemailer', () => ({
  nodemailerAdapter: async () => () => ({
    name: 'isolated-email',
    defaultFromAddress: 'fixture@example.test',
    defaultFromName: 'Fixture',
    sendEmail: vi.fn(),
  }),
}))

const payload = await createMongoSecurityFixture()

describe('Database-enforced publication and administrator uniqueness', () => {
  it('allows only one initial administrator when both signups reach the insert with an empty-user snapshot', async () => {
    await payload.db.collections.users.init()
    const arrivals = { count: 0 }
    const release = vi.fn<() => void>()
    const gate = new Promise<void>((resolve) => release.mockImplementation(resolve))
    const synchronize: CollectionBeforeChangeHook = async ({ data }) => {
      if (data.initialAdministrator && arrivals.count < 2) {
        arrivals.count += 1
        if (arrivals.count === 2) {
          release()
        }
        await gate
      }
      return data
    }
    const hooks = payload.collections.users.config.hooks.beforeChange
    hooks.push(synchronize)
    try {
      const results = await Promise.allSettled(
        ['alice', 'mallory'].map((name) =>
          payload.create({
            collection: 'users',
            overrideAccess: false,
            data: { name, email: `${name}@example.test`, emailVerified: false },
          }),
        ),
      )
      expect(arrivals.count).toBe(2)
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
      const users = await payload.find({
        collection: 'users',
        where: { bot: { not_equals: true } },
      })
      expect(users.docs).toHaveLength(1)
      expect(users.docs[0].role).toEqual(['admin'])
      const ordinary = await payload.create({
        collection: 'users',
        overrideAccess: false,
        data: {
          name: 'Next user',
          email: 'next@example.test',
          emailVerified: false,
          role: ['admin'],
        },
      })
      expect(ordinary.role).toEqual(['user'])
    } finally {
      release()
      hooks.splice(hooks.indexOf(synchronize), 1)
    }
  })

  it('deduplicates concurrent bot posts for the same company and source without affecting ordinary posts', async () => {
    await payload.db.collections.posts.init()
    const botID = new ObjectId()
    const companyID = new ObjectId()
    await payload.db.collections.users.collection.insertOne({
      _id: botID,
      name: 'Fixture bot',
      email: 'publication-bot@example.test',
      role: ['user'],
      bot: true,
      emailVerified: true,
    })
    await payload.db.collections.companies.collection.insertOne({
      _id: companyID,
      name: 'Publication company',
      _status: 'published',
      noAutoPost: false,
    })
    const bot = await payload.findByID({ collection: 'users', id: botID.toHexString(), depth: 0 })
    const results = await Promise.allSettled(
      ['first', 'second'].map(async (slug) => {
        const req = await createLocalReq({ user: { ...bot, collection: 'users' } }, payload)
        return payload.create({
          collection: 'posts',
          overrideAccess: false,
          req,
          data: {
            title: 'Public article',
            content: 'A factual article about the company.',
            company: companyID.toHexString(),
            repost: 'https://news.example/article',
            slug,
            _status: 'published',
          },
        })
      }),
    )
    expect(
      results.filter((result) => result.status === 'fulfilled'),
      results
        .map((result) => (result.status === 'rejected' ? String(result.reason) : 'created'))
        .join('\n'),
    ).toHaveLength(1)
    const posts = await payload.find({
      collection: 'posts',
      where: { company: { equals: companyID.toHexString() } },
    })
    expect(posts.docs).toHaveLength(1)
    const storedPost = await payload.db.collections.posts.collection.findOne({
      _id: new ObjectId(posts.docs[0].id),
    })
    expect(storedPost?.aiPublicationKey).toMatch(/^[a-f0-9]{64}$/)
    const botReq = await createLocalReq({ user: { ...bot, collection: 'users' } }, payload)
    await payload.update({
      collection: 'posts',
      id: posts.docs[0].id,
      req: botReq,
      overrideAccess: false,
      data: { title: 'Updated public article', aiPublicationKey: 'forged-key' },
    })
    expect(
      (
        await payload.db.collections.posts.collection.findOne({
          _id: new ObjectId(posts.docs[0].id),
        })
      )?.aiPublicationKey,
    ).toBe(storedPost?.aiPublicationKey)
    const ownerID = new ObjectId()
    await payload.db.collections.users.collection.insertOne({
      _id: ownerID,
      name: 'Manual publisher',
      email: 'manual-publisher@example.test',
      role: ['admin'],
      emailVerified: true,
    })
    const user = await payload.findByID({
      collection: 'users',
      id: ownerID.toHexString(),
      depth: 0,
    })
    const req = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
    await Promise.all(
      ['manual-one', 'manual-two'].map((slug) =>
        payload.create({
          collection: 'posts',
          overrideAccess: false,
          req,
          data: {
            title: 'Manually published',
            content: 'A manually written post.',
            company: companyID.toHexString(),
            repost: 'https://news.example/article',
            slug,
            _status: 'draft',
          },
        }),
      ),
    )
    expect(
      await payload.count({
        collection: 'posts',
        where: { company: { equals: companyID.toHexString() } },
      }),
    ).toMatchObject({ totalDocs: 3 })
  })
})
