import type { PayloadRequest } from 'payload'

import { LIKEABLE_COLLECTIONS, type LikeableCollectionSlug } from './constants'

type LikeRequestContext = {
  likedTargetIDsByCollection?: Record<string, Promise<Set<string>>>
}

type LikeDocumentIDLike = {
  id?: number | string
  targetID?: unknown
}

export const getLikeCollectionConfig = (
  collectionSlug: LikeableCollectionSlug,
): (typeof LIKEABLE_COLLECTIONS)[number] => {
  const config = LIKEABLE_COLLECTIONS.find((entry) => entry.collectionSlug === collectionSlug)

  if (!config) {
    throw new Error(`Unsupported like collection: ${collectionSlug}`)
  }

  return config
}

export const getLikeCollectionSlug = (
  collectionSlug: LikeableCollectionSlug,
): (typeof LIKEABLE_COLLECTIONS)[number]['likeCollectionSlug'] => {
  return getLikeCollectionConfig(collectionSlug).likeCollectionSlug
}

export const getLikeRequestContext = (req: PayloadRequest): LikeRequestContext => {
  if (!req.context || typeof req.context !== 'object') {
    req.context = {}
  }

  return req.context as LikeRequestContext
}

export const clearCachedLikedTargetIDs = ({
  actorKey,
  collectionSlug,
  req,
}: {
  actorKey: string
  collectionSlug: LikeableCollectionSlug
  req: PayloadRequest
}): void => {
  const context = getLikeRequestContext(req)

  if (!context.likedTargetIDsByCollection) {
    return
  }

  delete context.likedTargetIDsByCollection[`${collectionSlug}:${actorKey}`]
}

export const getLikeActorKey = (req: PayloadRequest): string | null => {
  if (req.user?.id) {
    return String(req.user.id)
  }

  return null
}

export const getLikeTargetID = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)

  if (value && typeof value === 'object') {
    const nestedID = (value as { id?: number | string }).id

    if (typeof nestedID === 'string') return nestedID
    if (typeof nestedID === 'number') return String(nestedID)
  }

  return null
}

export const getLikeDocumentID = (value: LikeDocumentIDLike): string | null => {
  if (typeof value.id === 'string') return value.id
  if (typeof value.id === 'number') return String(value.id)
  return getLikeTargetID(value.targetID)
}

export const getCachedLikedTargetIDs = async ({
  actorKey,
  collectionSlug,
  req,
}: {
  actorKey: string
  collectionSlug: LikeableCollectionSlug
  req: PayloadRequest
}): Promise<Set<string>> => {
  const context = getLikeRequestContext(req)
  const cacheKey = `${collectionSlug}:${actorKey}`

  if (!context.likedTargetIDsByCollection) {
    context.likedTargetIDsByCollection = {}
  }

  const existing = context.likedTargetIDsByCollection[cacheKey]
  if (existing) {
    return existing
  }

  const likeCollectionSlug = getLikeCollectionSlug(collectionSlug)
  const promise = req.payload
    .find({
      collection: likeCollectionSlug,
      depth: 0,
      overrideAccess: true,
      pagination: false,
      req,
      select: {
        targetID: true,
      },
      where: {
        userId: {
          equals: actorKey,
        },
      },
    })
    .then((result) => {
      return new Set(
        result.docs
          .map((doc) => getLikeTargetID((doc as { targetID?: unknown }).targetID))
          .filter((targetID): targetID is string => typeof targetID === 'string'),
      )
    })

  context.likedTargetIDsByCollection[cacheKey] = promise
  return promise
}
