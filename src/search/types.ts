import type { Search } from '@/payload-types'
import type { PayloadRequest } from 'payload'
import { indexedCollections } from './constants'

export type SearchIndexedCollectionSlug = (typeof indexedCollections)[number]

export type SearchCategoryDoc = {
  id?: string | number | null
  title?: string | null
}

export type SearchableDoc = {
  id: string | number
  _status?: string | null
  title?: string | null
  name?: string | null
  slug?: string | null
  meta?: {
    title?: string | null
    description?: string | null
    image?: NonNullable<Search['meta']>['image']
  } | null
  categories?: Array<
    | string
    | number
    | {
        id?: string | number | null
        title?: string | null
      }
  > | null
}

export type SearchCollectionResult = {
  docs: SearchableDoc[]
  hasNextPage: boolean
}

export type SearchReindexDoc = {
  doc: Search['doc']
  title: string
  slug?: string | null
  meta?: {
    title?: string | null
    description?: string | null
    image?: NonNullable<Search['meta']>['image']
  }
  categories?: Array<{
    relationTo: 'categories'
    categoryID: string
    title: string
  }> | null
  priority: number
}

export type SearchReindexService = {
  req: PayloadRequest
  payload: {
    find: (args: {
      collection: SearchIndexedCollectionSlug
      depth: number
      limit: number
      overrideAccess: boolean
      page: number
    }) => Promise<SearchCollectionResult>
    findByID: (args: {
      collection: 'categories'
      depth: number
      id: string | number
      overrideAccess: boolean
      req?: Partial<PayloadRequest>
      select: {
        title: true
      }
    }) => Promise<SearchCategoryDoc | null>
    replace: (docs: SearchReindexDoc[]) => Promise<void>
    logger: {
      info: (message: string) => void
    }
  }
}
