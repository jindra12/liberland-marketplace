import type { CollectionSlug, GraphQLExtension, PayloadRequest } from 'payload'

import { LIKEABLE_COLLECTIONS } from './constants'
import { requireVerifiedEmail } from '@/hooks/requireVerifiedEmail'
import {
  clearCachedLikedTargetIDs,
  getCachedLikedTargetIDs,
  getLikeActorKey,
  getLikeCollectionSlug,
  getLikeDocumentID,
  getLikeTargetID,
} from './utils'

type LikeGraphQLCollectionName = (typeof LIKEABLE_COLLECTIONS)[number]['graphqlName']

type LikeStatusArgs = {
  collection: LikeGraphQLCollectionName
  id: string
}

type SetLikeStateArgs = LikeStatusArgs & {
  liked: boolean
}

type LikeStatusResult = {
  collection: LikeGraphQLCollectionName
  hasLiked: boolean
  id: string
  likeCount: number
}

type GraphQLContext = {
  req: PayloadRequest
}

const LIKEABLE_COLLECTION_BY_GRAPHQL_NAME = LIKEABLE_COLLECTIONS.reduce(
  (collectionMap, collection) => {
    collectionMap[collection.graphqlName] = collection
    return collectionMap
  },
  {} as Record<LikeGraphQLCollectionName, (typeof LIKEABLE_COLLECTIONS)[number]>,
)

const getLikeableCollection = (collectionName: LikeGraphQLCollectionName) => {
  const collection = LIKEABLE_COLLECTION_BY_GRAPHQL_NAME[collectionName]

  if (!collection) {
    throw new Error(`Unsupported like collection: ${collectionName}`)
  }

  return collection
}

const requireLikeActor = ({
  graphQL,
  req,
}: {
  graphQL: Parameters<GraphQLExtension>[0]
  req: PayloadRequest
}): string => {
  const actorKey = getLikeActorKey(req)

  if (!actorKey) {
    throw new graphQL.GraphQLError('Unable to resolve a like actor from the request.', {
      extensions: {
        code: 'UNAUTHORIZED',
      },
    })
  }

  return actorKey
}

const getLikeStatus = async ({
  collection,
  id,
  req,
}: {
  collection: (typeof LIKEABLE_COLLECTIONS)[number]
  id: string
  req: PayloadRequest
}): Promise<LikeStatusResult> => {
  const document = await req.payload.findByID({
    collection: collection.collectionSlug,
    depth: 0,
    id,
    overrideAccess: true,
    req,
  })

  const actorKey = getLikeActorKey(req)
  const likedTargetIDs =
    actorKey !== null
      ? await getCachedLikedTargetIDs({
          actorKey,
          collectionSlug: collection.collectionSlug,
          req,
        })
      : new Set<string>()

  const targetID = getLikeTargetID(document)
  const likeCountValue = (document as { likeCount?: unknown }).likeCount
  const likeCount = typeof likeCountValue === 'number' ? likeCountValue : 0

  return {
    collection: collection.graphqlName,
    hasLiked: targetID !== null ? likedTargetIDs.has(targetID) : false,
    id,
    likeCount,
  }
}

const setLikeState = async ({
  collection,
  id,
  liked,
  req,
  graphQL,
}: {
  collection: (typeof LIKEABLE_COLLECTIONS)[number]
  graphQL: Parameters<GraphQLExtension>[0]
  id: string
  liked: boolean
  req: PayloadRequest
}): Promise<LikeStatusResult> => {
  const actorKey = requireLikeActor({
    graphQL,
    req,
  })

  requireVerifiedEmail(req, 'You must verify your email before liking content.')

  const likeCollectionSlug = getLikeCollectionSlug(collection.collectionSlug)

  const existingLike = await req.payload.find({
    collection: likeCollectionSlug,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    where: {
      and: [
        {
          userId: {
            equals: actorKey,
          },
        },
        {
          targetID: {
            equals: id,
          },
        },
      ],
    },
  })

  const likeDocument = existingLike.docs[0] as { id?: number | string; targetID?: unknown } | undefined

  if (liked && !likeDocument) {
    await req.payload.create({
      collection: likeCollectionSlug,
      data: {
        targetID: id,
        userId: actorKey,
      },
      draft: false,
      overrideAccess: true,
      req,
    })
  }

  if (!liked && likeDocument?.id) {
    await req.payload.delete({
      collection: likeCollectionSlug,
      id: String(getLikeDocumentID(likeDocument) ?? likeDocument.id),
      overrideAccess: true,
      req,
    })
  }

  clearCachedLikedTargetIDs({
    actorKey,
    collectionSlug: collection.collectionSlug,
    req,
  })

  return getLikeStatus({
    collection,
    id,
    req,
  })
}

export const likesGraphQLQueries: GraphQLExtension = (graphQL) => {
  const likeCollectionEnum = new graphQL.GraphQLEnumType({
    name: 'LikeableCollection',
    values: LIKEABLE_COLLECTIONS.reduce(
      (values, collection) => {
        values[collection.graphqlName] = {
          value: collection.graphqlName,
        }

        return values
      },
      {} as Record<LikeGraphQLCollectionName, { value: LikeGraphQLCollectionName }>,
    ),
  })

  const likeStatusType = new graphQL.GraphQLObjectType({
    fields: {
      collection: {
        type: new graphQL.GraphQLNonNull(likeCollectionEnum),
      },
      hasLiked: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLBoolean),
      },
      id: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
      likeCount: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLInt),
      },
    },
    name: 'LikeStatus',
  })

  return {
    likeStatus: {
      args: {
        collection: {
          type: new graphQL.GraphQLNonNull(likeCollectionEnum),
        },
        id: {
          type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
        },
      },
      resolve: async (_source: unknown, args: LikeStatusArgs, context: GraphQLContext) => {
        return getLikeStatus({
          collection: getLikeableCollection(args.collection),
          id: args.id,
          req: context.req,
        })
      },
      type: new graphQL.GraphQLNonNull(likeStatusType),
    },
  }
}

export const likesGraphQLMutations: GraphQLExtension = (graphQL) => {
  const likeCollectionEnum = new graphQL.GraphQLEnumType({
    name: 'LikeableCollectionMutation',
    values: LIKEABLE_COLLECTIONS.reduce(
      (values, collection) => {
        values[collection.graphqlName] = {
          value: collection.graphqlName,
        }

        return values
      },
      {} as Record<LikeGraphQLCollectionName, { value: LikeGraphQLCollectionName }>,
    ),
  })

  const likeStatusType = new graphQL.GraphQLObjectType({
    fields: {
      collection: {
        type: new graphQL.GraphQLNonNull(likeCollectionEnum),
      },
      hasLiked: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLBoolean),
      },
      id: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
      likeCount: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLInt),
      },
    },
    name: 'LikeStateMutationResult',
  })

  return {
    setLikeState: {
      args: {
        collection: {
          type: new graphQL.GraphQLNonNull(likeCollectionEnum),
        },
        id: {
          type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
        },
        liked: {
          type: new graphQL.GraphQLNonNull(graphQL.GraphQLBoolean),
        },
      },
      resolve: async (_source: unknown, args: SetLikeStateArgs, context: GraphQLContext) => {
        return setLikeState({
          collection: getLikeableCollection(args.collection),
          graphQL,
          id: args.id,
          liked: args.liked,
          req: context.req,
        })
      },
      type: new graphQL.GraphQLNonNull(likeStatusType),
    },
  }
}
