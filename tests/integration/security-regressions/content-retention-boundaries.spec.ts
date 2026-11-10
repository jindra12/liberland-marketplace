import { describe, expect, it, vi } from 'vitest'
import { ObjectId } from 'mongodb'
import { APIError, createLocalReq } from 'payload'
import { mock } from 'vitest-mock-extended'
import type { User } from '@/payload-types'
import { createMongoSecurityFixture } from './mongo/utils'
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
const payload = await createMongoSecurityFixture()

describe('Persisted content and account privacy', () => {
  it.each(['posts', 'pages', 'companies', 'products', 'jobs', 'startups'] as const)(
    "does not expose another account's historical %s drafts through the versions API",
    async (collection) => {
      const parent = new ObjectId()
      const owner = new ObjectId()
      const id = new ObjectId()
      await payload.db.versions[collection].collection.insertOne({
        _id: id,
        parent,
        version: { title: 'Confidential historical content', _status: 'draft', createdBy: owner },
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      const ownVersions = await payload.findVersions({
        collection,
        where: { parent: { equals: parent.toHexString() } },
        overrideAccess: false,
        depth: 0,
        user: mock<User & { collection: 'users' }>({
          id: owner.toHexString(),
          role: ['user'],
          collection: 'users',
        }),
      })
      expect(ownVersions.docs).toHaveLength(1)
      try {
        const result = await payload.findVersions({
          collection,
          where: { parent: { equals: parent.toHexString() } },
          overrideAccess: false,
          depth: 0,
          user: mock<User & { collection: 'users' }>({
            id: new ObjectId().toHexString(),
            role: ['user'],
            collection: 'users',
          }),
        })
        expect(result.docs).toHaveLength(0)
      } catch (error) {
        if (error instanceof APIError && error.status === 403) {
          return
        }
        throw error
      }
    },
  )

  it.each(['users', 'companies'] as const)(
    'removes live subscription delivery after deleting its %s record',
    async (collection) => {
      const userID = new ObjectId()
      const companyID = new ObjectId()
      const subscriberID = new ObjectId()
      const email = `${userID.toHexString()}@example.test`
      await payload.db.collections.users.collection.insertOne({
        _id: userID,
        email,
        role: ['user'],
        emailVerified: true,
      })
      await payload.db.collections.companies.collection.insertOne({
        _id: companyID,
        name: 'Disposable company',
        _status: 'published',
      })
      await payload.db.collections.subscribers.collection.insertOne({
        _id: subscriberID,
        email,
        isActive: true,
      })
      const subscriptions = payload.db.connection.db!.collection<{
        _id: string
        createdBy: ObjectId
        subscriber: ObjectId
        email: string
        targetCollection: 'companies'
        targetID: string
      }>(payload.db.collections['notification-subscriptions'].collection.collectionName)
      await subscriptions.insertOne({
        _id: `subscription-${userID.toHexString()}`,
        createdBy: userID,
        subscriber: subscriberID,
        email,
        targetCollection: 'companies',
        targetID: companyID.toHexString(),
      })
      const req = await createLocalReq({}, payload)
      expect(
        await getNotificationRecipientsForTarget({
          req,
          targetCollection: 'companies',
          targetID: companyID.toHexString(),
        }),
      ).toHaveLength(1)
      await payload.delete({
        collection,
        id: (collection === 'users' ? userID : companyID).toHexString(),
        overrideAccess: true,
      })
      expect(
        await getNotificationRecipientsForTarget({
          req,
          targetCollection: 'companies',
          targetID: companyID.toHexString(),
        }),
      ).toHaveLength(0)
    },
  )
})
