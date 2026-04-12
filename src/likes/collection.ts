import { ObjectId } from 'mongodb'
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  Field,
} from 'payload'

import type { LikeableCollectionSlug } from './constants'
import { getLikeActorKey, getLikeCollectionConfig, getLikeCollectionSlug, getLikeTargetID } from './utils'

type LikeCountCollection = {
  updateOne: (filter: { _id: ObjectId | string }, update: { $inc: { likeCount: number } }) => Promise<unknown>
}

type LikeCountCollectionMap = Record<string, { collection?: LikeCountCollection }>

const getLikeCountCollection = (
  collectionMap: LikeCountCollectionMap,
  collectionSlug: LikeableCollectionSlug,
): LikeCountCollection => {
  const collection = collectionMap[collectionSlug]?.collection

  if (!collection) {
    throw new Error(`Missing Mongo collection for "${collectionSlug}".`)
  }

  return collection
}

const updateLikeCount = async ({
  collectionSlug,
  delta,
  req,
  targetID,
}: {
  collectionSlug: LikeableCollectionSlug
  delta: number
  req: Parameters<CollectionAfterChangeHook>[0]['req']
  targetID: string
}): Promise<void> => {
  const collectionMap = req.payload.db.collections as LikeCountCollectionMap
  const targetCollection = getLikeCountCollection(collectionMap, collectionSlug)
  const mongoID = ObjectId.isValid(targetID) ? new ObjectId(targetID) : targetID

  await targetCollection.updateOne(
    {
      _id: mongoID,
    },
    {
      $inc: {
        likeCount: delta,
      },
    },
  )
}

const setLikeActorKey: CollectionBeforeValidateHook = ({ data, operation, req }) => {
  if (operation !== 'create' || !data || typeof data !== 'object' || Array.isArray(data)) {
    return data
  }

  const actorKey = getLikeActorKey(req)
  if (!actorKey) {
    throw new Error('Unable to resolve a like actor from the request.')
  }

  const nextData = data as Record<string, unknown>

  return {
    ...nextData,
    userId: actorKey,
  }
}

const buildLikeCountHook =
  (collectionSlug: LikeableCollectionSlug): CollectionAfterChangeHook =>
  async ({ doc, operation, req }) => {
    if (operation !== 'create') {
      return doc
    }

    const targetID = getLikeTargetID((doc as { targetID?: unknown }).targetID)
    if (!targetID) {
      return doc
    }

    await updateLikeCount({
      collectionSlug,
      delta: 1,
      req,
      targetID,
    })

    return doc
  }

const buildLikeCountDeleteHook =
  (collectionSlug: LikeableCollectionSlug): CollectionAfterDeleteHook =>
  async ({ doc, req }) => {
    const targetID = getLikeTargetID((doc as { targetID?: unknown }).targetID)

    if (!targetID) {
      return doc
    }

    await updateLikeCount({
      collectionSlug,
      delta: -1,
      req,
      targetID,
    })

    return doc
  }

const likeFields: Field[] = [
  {
    name: 'userId',
    type: 'text',
    required: true,
    admin: {
      hidden: true,
      readOnly: true,
    },
  },
  {
    name: 'targetID',
    type: 'text',
    required: true,
    admin: {
      hidden: true,
      readOnly: true,
    },
  },
]

export const createLikeCollection = (collectionSlug: LikeableCollectionSlug): CollectionConfig => {
  const likeCollectionSlug = getLikeCollectionSlug(collectionSlug)

  return {
    slug: likeCollectionSlug,
    admin: {
      hidden: true,
    },
    access: {
      create: () => false,
      delete: () => false,
      read: () => false,
      update: () => false,
    },
    hooks: {
      afterChange: [buildLikeCountHook(collectionSlug)],
      afterDelete: [buildLikeCountDeleteHook(collectionSlug)],
      beforeValidate: [setLikeActorKey],
    },
    indexes: [
      {
        fields: ['userId', 'targetID'],
        unique: true,
      },
      {
        fields: ['targetID'],
      },
      {
        fields: ['userId'],
      },
    ],
    labels: {
      plural: getLikeCollectionConfig(collectionSlug).labelPlural,
      singular: getLikeCollectionConfig(collectionSlug).labelSingular,
    },
    timestamps: true,
    fields: likeFields,
  }
}
