import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, PayloadRequest } from 'payload'

import type { LikeableCollectionSlug } from '@/likes/constants'
import { getLikeCollectionSlug, getLikeTargetID } from '@/likes/utils'
import { getNotificationSubscriberCountForTarget } from '@/newsletter/notificationSubscriptions'
import type { NotificationTargetCollection } from '@/newsletter/constants'

const isNotificationTargetCollection = (
  value: unknown,
): value is NotificationTargetCollection =>
  value === 'companies' ||
  value === 'identities' ||
  value === 'jobs' ||
  value === 'products' ||
  value === 'startups'

type RawCollection = {
  updateOne: (filter: { _id: string }, update: { $set: Record<string, unknown> }) => Promise<unknown>
}

type RawCollectionMap = Record<string, { collection?: RawCollection }>

const updateTargetDocument = async ({
  collectionSlug,
  data,
  id,
  req,
}: {
  collectionSlug: LikeableCollectionSlug | NotificationTargetCollection
  data: Record<string, unknown>
  id: string
  req: PayloadRequest
}): Promise<void> => {
  const collectionMap = req.payload.db.collections as unknown as RawCollectionMap
  const collection = collectionMap[collectionSlug]?.collection

  if (!collection) {
    throw new Error(`Missing raw collection for "${collectionSlug}".`)
  }

  await collection.updateOne(
    {
      _id: id,
    },
    {
      $set: data,
    },
  )
}

const getLatestLikeTimestamp = async ({
  collectionSlug,
  req,
  targetID,
}: {
  collectionSlug: LikeableCollectionSlug
  req: PayloadRequest
  targetID: string
}): Promise<string | null> => {
  const likeCollectionSlug = getLikeCollectionSlug(collectionSlug)
  const result = await req.payload.find({
    collection: likeCollectionSlug,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    sort: '-createdAt',
    where: {
      targetID: {
        equals: targetID,
      },
    },
  })

  const latestLike = result.docs[0] as { createdAt?: string | Date | null } | undefined

  if (!latestLike?.createdAt) {
    return null
  }

  const latestLikeDate = new Date(latestLike.createdAt)

  return Number.isNaN(latestLikeDate.getTime()) ? null : latestLikeDate.toISOString()
}

export const syncLastLikeAtAfterLikeChange =
  (collectionSlug: LikeableCollectionSlug): CollectionAfterChangeHook =>
  async ({ doc, operation, req }) => {
    if (operation !== 'create') {
      return doc
    }

    const targetID = getLikeTargetID((doc as { targetID?: unknown }).targetID)
    const createdAt = (doc as { createdAt?: string | Date | null }).createdAt

    if (!targetID || !createdAt) {
      return doc
    }

    await updateTargetDocument({
      collectionSlug,
      data: {
        lastLikeAt: new Date(createdAt).toISOString(),
      },
      id: targetID,
      req,
    })

    return doc
  }

export const syncLastLikeAtAfterLikeDelete =
  (collectionSlug: LikeableCollectionSlug): CollectionAfterDeleteHook =>
  async ({ doc, req }) => {
    const targetID = getLikeTargetID((doc as { targetID?: unknown }).targetID)

    if (!targetID) {
      return doc
    }

    await updateTargetDocument({
      collectionSlug,
      data: {
        lastLikeAt: await getLatestLikeTimestamp({
          collectionSlug,
          req,
          targetID,
        }),
      },
      id: targetID,
      req,
    })

    return doc
  }

export const syncSubscriberCountAfterChange: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== 'create') {
    return doc
  }

  const targetCollection = isNotificationTargetCollection(
    (doc as { targetCollection?: unknown }).targetCollection,
  )
    ? (doc as { targetCollection?: NotificationTargetCollection }).targetCollection
    : null
  const targetID = typeof (doc as { targetID?: unknown }).targetID === 'string'
    ? (doc as { targetID?: string }).targetID
    : null

  if (!targetCollection || !targetID) {
    return doc
  }

  await updateTargetDocument({
    collectionSlug: targetCollection,
    data: {
      subscriberCount: await getNotificationSubscriberCountForTarget({
        req,
        targetCollection,
        targetID,
      }),
    },
    id: targetID,
    req,
  })

  return doc
}

export const syncSubscriberCountAfterDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const targetCollection = isNotificationTargetCollection(
    (doc as { targetCollection?: unknown }).targetCollection,
  )
    ? (doc as { targetCollection?: NotificationTargetCollection }).targetCollection
    : null
  const targetID = typeof (doc as { targetID?: unknown }).targetID === 'string'
    ? (doc as { targetID?: string }).targetID
    : null

  if (!targetCollection || !targetID) {
    return doc
  }

  await updateTargetDocument({
    collectionSlug: targetCollection,
    data: {
      subscriberCount: await getNotificationSubscriberCountForTarget({
        req,
        targetCollection,
        targetID,
      }),
    },
    id: targetID,
    req,
  })

  return doc
}
