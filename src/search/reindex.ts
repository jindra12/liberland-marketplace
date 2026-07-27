import type { Search } from '@/payload-types'
import type { PayloadRequest } from 'payload'

export const indexedCollections = ['jobs', 'companies', 'identities', 'products', 'startups', 'posts'] as const

export type SearchIndexedCollectionSlug = (typeof indexedCollections)[number]

type SearchDocRelation = Search['doc']['relationTo']

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

type SearchReindexDoc = {
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
    create: (args: {
      collection: 'search'
      data: SearchReindexDoc
      draft: false
      depth: 0
      overrideAccess: true
    }) => Promise<unknown>
    deleteMany: (args: {
      collection: 'search'
      where: Record<string, never>
    }) => Promise<unknown> | unknown
    logger: {
      info: (message: string) => void
    }
  }
}

const createSearchDoc = (relationTo: SearchDocRelation, value: string): Search['doc'] => {
  const searchDoc: Search['doc'] = {
    relationTo,
    value,
  }

  return searchDoc
}

const loadAllDocs = async (
  service: SearchReindexService,
  collection: SearchIndexedCollectionSlug,
  page = 1,
  accumulated: SearchableDoc[] = [],
): Promise<SearchableDoc[]> => {
  const result = await service.payload.find({
    collection,
    depth: 0,
    limit: 100,
    overrideAccess: true,
    page,
  })

  const docs = [...accumulated, ...result.docs]

  if (result.hasNextPage) {
    return loadAllDocs(service, collection, page + 1, docs)
  }

  return docs
}

const resolveTitle = (doc: SearchableDoc): string => {
  return doc.title ?? doc.name ?? doc.meta?.title ?? ''
}

const resolveCategories = async (
  service: SearchReindexService,
  doc: SearchableDoc,
): Promise<SearchReindexDoc['categories']> => {
  const categories = doc.categories

  if (!Array.isArray(categories) || categories.length === 0) {
    return []
  }

  const resolvedCategories = await Promise.all(
    categories.map(async (category) => {
      if (typeof category === 'object' && category !== null) {
        const title = category.title ?? ''
        return title.length > 0
          ? {
              relationTo: 'categories' as const,
              categoryID: String(category.id),
              title,
            }
          : null
      }

      const foundCategory = await service.payload.findByID({
        collection: 'categories',
        depth: 0,
        id: category,
        overrideAccess: true,
        select: {
          title: true,
        },
      })

      if (!foundCategory || typeof foundCategory.title !== 'string' || foundCategory.title.length === 0) {
        return null
      }

      return {
        relationTo: 'categories' as const,
        categoryID: String(foundCategory.id),
        title: foundCategory.title,
      }
    }),
  )

  return resolvedCategories.filter(
    (category): category is NonNullable<(typeof resolvedCategories)[number]> => category !== null,
  )
}

const buildSearchReindexDoc = async (
  service: SearchReindexService,
  collection: SearchIndexedCollectionSlug,
  doc: SearchableDoc,
): Promise<SearchReindexDoc> => {
  const searchDoc = createSearchDoc(collection, String(doc.id))
  const resolvedCategories = await resolveCategories(service, doc)

  return {
    doc: searchDoc,
    title: resolveTitle(doc),
    slug: doc.slug,
    meta: doc.meta
      ? {
          title: resolveTitle(doc),
          description: doc.meta?.description,
          image: doc.meta?.image ?? null,
        }
      : undefined,
    categories: resolvedCategories,
    priority: 0,
  }
}

export const syncSearchCollection = async (
  service: SearchReindexService,
  collection: SearchIndexedCollectionSlug,
): Promise<number> => {
  const docs = await loadAllDocs(service, collection)
  const publishedDocs = docs.filter((doc) => doc._status !== 'draft')
  const searchDocs = await Promise.all(
    publishedDocs.map(async (doc) => buildSearchReindexDoc(service, collection, doc)),
  )

  await Promise.all(
    searchDocs.map(async (data) =>
      service.payload.create({
        collection: 'search',
        data,
        draft: false,
        depth: 0,
        overrideAccess: true,
      }),
    ),
  )

  return searchDocs.length
}

export const reindexSearch = async (
  service: SearchReindexService,
): Promise<Array<{ collection: SearchIndexedCollectionSlug; count: number }>> => {
  await service.payload.deleteMany({
    collection: 'search',
    where: {},
  })

  return Promise.all(
    indexedCollections.map(async (collection) => ({
      collection,
      count: await syncSearchCollection(service, collection),
    })),
  )
}
