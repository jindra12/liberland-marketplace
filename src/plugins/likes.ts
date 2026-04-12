import type { CollectionConfig, Config, Field, GraphQLExtension, Plugin } from 'payload'

import { createLikeCollection } from '@/likes/collection'
import { createLikeableFields } from '@/likes/fields'
import { LIKEABLE_COLLECTIONS } from '@/likes/constants'
import { likesGraphQLMutations, likesGraphQLQueries } from '@/likes/graphql'

const injectLikeFields = (collection: CollectionConfig): CollectionConfig => {
  const likeableCollection = LIKEABLE_COLLECTIONS.find(
    (entry) => entry.collectionSlug === collection.slug,
  )

  if (!likeableCollection) {
    return collection
  }

  const existingFieldNames = new Set(
    (collection.fields ?? [])
      .map((field) => ('name' in field && typeof field.name === 'string' ? field.name : null))
      .filter((name): name is string => typeof name === 'string'),
  )

  const likeFields = createLikeableFields(likeableCollection.collectionSlug).filter(
    (field) => !('name' in field) || !existingFieldNames.has(field.name),
  )

  return {
    ...collection,
    fields: [...(collection.fields ?? []), ...likeFields] as Field[],
  }
}

const buildLikeCollections = (): CollectionConfig[] => {
  return LIKEABLE_COLLECTIONS.map((collection) => createLikeCollection(collection.collectionSlug))
}

const composeGraphQLExtension =
  (existingExtension: GraphQLExtension | undefined, injectedExtension: GraphQLExtension): GraphQLExtension =>
  (graphQL, context) => {
    if (!existingExtension) {
      return injectedExtension(graphQL, context)
    }

    return {
      ...existingExtension(graphQL, context),
      ...injectedExtension(graphQL, context),
    }
  }

export const likesPlugin: Plugin = (config: Config): Config => {
  const existingCollectionSlugs = new Set((config.collections ?? []).map((collection) => collection.slug))
  const likeCollections = buildLikeCollections().filter(
    (collection) => !existingCollectionSlugs.has(collection.slug),
  )

  return {
    ...config,
    collections: [...(config.collections ?? []).map(injectLikeFields), ...likeCollections],
    graphQL: {
      ...config.graphQL,
      mutations: composeGraphQLExtension(config.graphQL?.mutations, likesGraphQLMutations),
      queries: composeGraphQLExtension(config.graphQL?.queries, likesGraphQLQueries),
    },
  }
}
