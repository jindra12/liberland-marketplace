import type { CheckboxField, Field, NumberField } from 'payload'

import type { LikeableCollectionSlug } from './constants'
import { createContentRankingFields } from '@/fields/contentRankingFields'
import { getCachedLikedTargetIDs, getLikeActorKey, getLikeTargetID } from './utils'

const likeCountField: NumberField = {
  name: 'likeCount',
  type: 'number',
  defaultValue: 0,
  admin: {
    hidden: true,
    readOnly: true,
  },
  access: {
    create: () => false,
    update: () => false,
  },
}

const buildHasLikedField = (collectionSlug: LikeableCollectionSlug): CheckboxField => ({
  name: 'hasLiked',
  type: 'checkbox',
  virtual: true,
  admin: {
    hidden: true,
    readOnly: true,
  },
  access: {
    create: () => false,
    update: () => false,
  },
  hooks: {
    afterRead: [
      async ({ data, req }) => {
        const targetID = getLikeTargetID(data)
        if (!targetID) {
          return false
        }

        const actorKey = getLikeActorKey(req)
        if (!actorKey) {
          return false
        }

        const likedTargetIDs = await getCachedLikedTargetIDs({
          actorKey,
          collectionSlug,
          req,
        })

        return likedTargetIDs.has(targetID)
      },
    ],
  },
})

export const createLikeableFields = (collectionSlug: LikeableCollectionSlug): Field[] => {
  return [likeCountField, ...createContentRankingFields(), buildHasLikedField(collectionSlug)]
}
