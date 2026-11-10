import { describe, expect, it, vi } from 'vitest'
import { ObjectId } from 'mongodb'
import { createLocalReq } from 'payload'
import { createMongoSecurityFixture } from './mongo/utils'
import { deliverNotificationEmail } from '@/newsletter/utils'
import { getNotificationRecipientsForTarget } from '@/newsletter/notificationSubscriptions'

vi.mock('@/utilities/sendAuthEmail', () => ({ sendAuthEmail: vi.fn() }))
vi.mock('@payloadcms/email-nodemailer', () => ({
  nodemailerAdapter: async () => () => ({
    name: 'isolated-email',
    defaultFromAddress: 'fixture@example.test',
    defaultFromName: 'Fixture',
    sendEmail: vi.fn(),
  }),
}))
vi.mock('@/newsletter/notificationSubscriptions', async (original) => ({
  ...(await original<typeof import('@/newsletter/notificationSubscriptions')>()),
  getNotificationRecipientsForTarget: vi.fn(async () => []),
}))

const payload = await createMongoSecurityFixture()

describe('Persisted notification lifecycle', () => {
  it('retains a failed delivery in a private job and executes the real task successfully on retry', async () => {
    const req = await createLocalReq({}, payload)
    const smtp = vi
      .spyOn(payload, 'sendEmail')
      .mockRejectedValueOnce(new Error('Temporary SMTP outage'))
      .mockResolvedValue({ accepted: ['reader@example.test'] })
    await deliverNotificationEmail(req, {
      to: 'reader@example.test',
      subject: 'Marketplace update',
      html: '<p>Public update</p>',
      text: 'Public update',
    })
    const jobs = await payload.find({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: 'sendNotificationEmail' } },
    })
    expect(jobs.docs).toHaveLength(1)
    await expect(
      payload.find({ collection: 'payload-jobs', overrideAccess: false }),
    ).rejects.toThrow()
    const userID = new ObjectId()
    await payload.db.collections.users.collection.insertOne({
      _id: userID,
      name: 'Ordinary reader',
      email: 'ordinary-reader@example.test',
      role: ['user'],
      emailVerified: true,
    })
    const user = await payload.findByID({ collection: 'users', id: userID.toHexString() })
    const readerReq = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
    await expect(
      payload.find({ collection: 'payload-jobs', overrideAccess: false, req: readerReq }),
    ).rejects.toThrow()
    await payload.jobs.runByID({ id: jobs.docs[0].id })
    expect(smtp).toHaveBeenCalledTimes(2)
    expect(await payload.count({ collection: 'payload-jobs' })).toMatchObject({ totalDocs: 0 })
    smtp.mockRestore()
  })

  it('does not repeat first-publication notices after real draft and republish saves', async () => {
    const ownerID = new ObjectId()
    const companyID = new ObjectId()
    await payload.db.collections.users.collection.insertOne({
      _id: ownerID,
      name: 'Notification owner',
      email: 'notification-owner@example.test',
      role: ['admin'],
      emailVerified: true,
    })
    await payload.db.collections.companies.collection.insertOne({
      _id: companyID,
      name: 'Notification company',
      _status: 'published',
      createdBy: ownerID,
      isPrivate: false,
    })
    const user = await payload.findByID({
      collection: 'users',
      id: ownerID.toHexString(),
      depth: 0,
    })
    const req = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
    const product = await payload.create({
      collection: 'products',
      overrideAccess: false,
      req,
      data: { name: 'Published product', company: companyID.toHexString(), _status: 'published' },
    })
    const lookups = () =>
      vi
        .mocked(getNotificationRecipientsForTarget)
        .mock.calls.filter(([args]) => args.targetCollection === 'companies').length
    expect(lookups()).toBe(1)
    await payload.update({
      collection: 'products',
      id: product.id,
      data: { _status: 'draft' },
      req,
      draft: true,
    })
    await payload.update({
      collection: 'products',
      id: product.id,
      data: { _status: 'published' },
      req,
    })
    expect(lookups()).toBe(1)
    const stored = await payload.db.collections.products.collection.findOne({
      _id: new ObjectId(product.id),
    })
    expect(stored?.publicationNotifiedAt).toBeTruthy()
  })
})
