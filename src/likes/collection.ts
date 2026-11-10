import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  Field,
} from 'payload'

import { createdByField } from '@/fields/createdByField'
import { TEXT_INPUT_MAX_LENGTH } from '@/fields/constants'
import type { LikeableCollectionSlug } from './constants'
import { getLikeActorKey, getLikeCollectionConfig, getLikeCollectionSlug, getLikeTargetID } from './utils'
import {
  syncLastLikeAtAfterLikeChange,
  syncLastLikeAtAfterLikeDelete,
} from '@/hooks/updateContentRankingSignals'

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
  await req.payload.db.updateOne({
    collection: collectionSlug, id: targetID, req,
    data: { likeCount: { $inc: delta } }, returning: false,
  })
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
    createdBy: actorKey,
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
  createdByField,
  {
    name: 'userId',
    relationTo: 'users',
    type: 'relationship',
    required: true,
    admin: {
      hidden: true,
      readOnly: true,
    },
  },
  {
    name: 'targetID',
    type: 'text',
    maxLength: TEXT_INPUT_MAX_LENGTH,
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
      afterChange: [buildLikeCountHook(collectionSlug), syncLastLikeAtAfterLikeChange(collectionSlug)],
      afterDelete: [buildLikeCountDeleteHook(collectionSlug), syncLastLikeAtAfterLikeDelete(collectionSlug)],
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
