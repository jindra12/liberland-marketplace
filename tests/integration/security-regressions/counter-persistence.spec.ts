import { describe, expect, it, vi } from 'vitest'
import { ObjectId } from 'mongodb'
import { createLocalReq, type CollectionAfterChangeHook } from 'payload'
import { mock } from 'vitest-mock-extended'
import { updateCommentReplyCountAfterChange } from '@/hooks/updateCommentReplyCount'
import { createMongoSecurityFixture } from './mongo/utils'

vi.mock('@/utilities/sendAuthEmail', () => ({ sendAuthEmail: vi.fn() }))
vi.mock('@payloadcms/email-nodemailer', () => ({
  nodemailerAdapter: async () => () => ({
    name: 'isolated-email', defaultFromAddress: 'fixture@example.test',
    defaultFromName: 'Fixture', sendEmail: vi.fn(),
  }),
}))

const payload = await createMongoSecurityFixture()

describe('Persisted content counters', () => {
  it('updates the real company counter and ranking on like creation and reverses the count on deletion', async () => {
    const owner = new ObjectId()
    const company = new ObjectId()
    await payload.db.collections.users.collection.insertOne({
      _id: owner, email: 'counter-owner@example.test', name: 'Counter owner',
      role: ['user'], emailVerified: true,
    })
    await payload.db.collections.companies.collection.insertOne({
      _id: company, name: 'Counter company', createdBy: owner,
      _status: 'published', likeCount: 0,
    })
    const user = await payload.findByID({ collection: 'users', id: owner.toHexString(), depth: 0 })
    const req = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
    const like = await payload.create({
      collection: 'company-likes', data: { targetID: company.toHexString(), userId: owner.toHexString() },
      overrideAccess: true, req,
    })
    const liked = await payload.findByID({ collection: 'companies', id: company.toHexString(), depth: 0 })
    expect(liked.likeCount).toBe(1)
    expect(liked.lastLikeAt).toBe(like.createdAt)
    await payload.delete({ collection: 'company-likes', id: like.id, overrideAccess: true, req })
    const unliked = await payload.findByID({ collection: 'companies', id: company.toHexString(), depth: 0 })
    expect(unliked.likeCount).toBe(0)
    expect(unliked.lastLikeAt).toBeNull()
  })

  it('atomically retains overlapping replies against the persisted parent rather than updating a string-ID shadow', async () => {
    const parent = new ObjectId()
    await payload.db.collections.comments.collection.insertOne({ _id: parent, replyCount: 0 })
    const req = await createLocalReq({}, payload)
    await Promise.all(['first', 'second'].map((id) => updateCommentReplyCountAfterChange(
      Object.assign(mock<Parameters<CollectionAfterChangeHook>[0]>(), {
        req, operation: 'create', doc: { id, replyComment: parent.toHexString() },
      }),
    )))
    const stored = await payload.db.collections.comments.collection.findOne({ _id: parent })
    expect(stored?.replyCount).toBe(2)
    expect(await payload.db.collections.comments.collection.countDocuments({})).toBe(1)
  })
})
