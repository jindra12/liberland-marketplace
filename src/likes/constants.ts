import type { CollectionSlug } from 'payload'

export type LikeableCollectionSlug = Extract<
  CollectionSlug,
  'companies' | 'comments' | 'identities' | 'jobs' | 'posts' | 'products' | 'startups'
>

export type LikeableGraphQLCollection =
  | 'companies'
  | 'comments'
  | 'identities'
  | 'jobs'
  | 'posts'
  | 'products'
  | 'ventures'

export type LikeableCollectionConfig = {
  collectionSlug: LikeableCollectionSlug
  graphqlName: LikeableGraphQLCollection
  includeSubscriberCount: boolean
  labelPlural: string
  labelSingular: string
  likeCollectionSlug: string
}

export const LIKEABLE_COLLECTIONS = [
  {
    collectionSlug: 'companies',
    graphqlName: 'companies',
    includeSubscriberCount: true,
    labelPlural: 'Company Likes',
    labelSingular: 'Company Like',
    likeCollectionSlug: 'company-likes',
  },
  {
    collectionSlug: 'identities',
    graphqlName: 'identities',
    includeSubscriberCount: true,
    labelPlural: 'Identity Likes',
    labelSingular: 'Identity Like',
    likeCollectionSlug: 'identity-likes',
  },
  {
    collectionSlug: 'comments',
    graphqlName: 'comments',
    includeSubscriberCount: false,
    labelPlural: 'Comment Likes',
    labelSingular: 'Comment Like',
    likeCollectionSlug: 'comment-likes',
  },
  {
    collectionSlug: 'startups',
    graphqlName: 'ventures',
    includeSubscriberCount: true,
    labelPlural: 'Venture Likes',
    labelSingular: 'Venture Like',
    likeCollectionSlug: 'venture-likes',
  },
  {
    collectionSlug: 'jobs',
    graphqlName: 'jobs',
    includeSubscriberCount: true,
    labelPlural: 'Job Likes',
    labelSingular: 'Job Like',
    likeCollectionSlug: 'job-likes',
  },
  {
    collectionSlug: 'products',
    graphqlName: 'products',
    includeSubscriberCount: true,
    labelPlural: 'Product Likes',
    labelSingular: 'Product Like',
    likeCollectionSlug: 'product-likes',
  },
  {
    collectionSlug: 'posts',
    graphqlName: 'posts',
    includeSubscriberCount: true,
    labelPlural: 'Post Likes',
    labelSingular: 'Post Like',
    likeCollectionSlug: 'post-likes',
  },
] as const satisfies readonly LikeableCollectionConfig[]
