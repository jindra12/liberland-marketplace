import type { CollectionSlug } from 'payload'

export type LikeableCollectionSlug = Extract<
  CollectionSlug,
  'companies' | 'identities' | 'jobs' | 'posts' | 'products' | 'startups'
>

export type LikeableGraphQLCollection = 'companies' | 'identities' | 'jobs' | 'posts' | 'products' | 'ventures'

export type LikeableCollectionConfig = {
  collectionSlug: LikeableCollectionSlug
  graphqlName: LikeableGraphQLCollection
  labelPlural: string
  labelSingular: string
  likeCollectionSlug: string
}

export const LIKEABLE_COLLECTIONS = [
  {
    collectionSlug: 'companies',
    graphqlName: 'companies',
    labelPlural: 'Company Likes',
    labelSingular: 'Company Like',
    likeCollectionSlug: 'company-likes',
  },
  {
    collectionSlug: 'identities',
    graphqlName: 'identities',
    labelPlural: 'Identity Likes',
    labelSingular: 'Identity Like',
    likeCollectionSlug: 'identity-likes',
  },
  {
    collectionSlug: 'startups',
    graphqlName: 'ventures',
    labelPlural: 'Venture Likes',
    labelSingular: 'Venture Like',
    likeCollectionSlug: 'venture-likes',
  },
  {
    collectionSlug: 'jobs',
    graphqlName: 'jobs',
    labelPlural: 'Job Likes',
    labelSingular: 'Job Like',
    likeCollectionSlug: 'job-likes',
  },
  {
    collectionSlug: 'products',
    graphqlName: 'products',
    labelPlural: 'Product Likes',
    labelSingular: 'Product Like',
    likeCollectionSlug: 'product-likes',
  },
  {
    collectionSlug: 'posts',
    graphqlName: 'posts',
    labelPlural: 'Post Likes',
    labelSingular: 'Post Like',
    likeCollectionSlug: 'post-likes',
  },
] as const satisfies readonly LikeableCollectionConfig[]
