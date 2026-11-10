import type { Search } from '@/payload-types'
import type { PayloadRequest } from 'payload'
import { replaceSearchIndex } from './replacement/utils'
import { toStringID } from '@/utilities/toStringID'

import { indexedCollections } from './constants'
import type {
  SearchIndexedCollectionSlug,
  SearchReindexDoc,
  SearchReindexService,
  SearchableDoc,
} from './types'

export const createSearchReindexService = (req: PayloadRequest): SearchReindexService => ({
  req,
  payload: {
    replace: (docs) => replaceSearchIndex(req, docs),
    find: (args) => req.payload.find({ ...args, req }),
    findByID: (args) => req.payload.findByID({ ...args, req }),
    logger: req.payload.logger,
  },
})

const createSearchDoc = (relationTo: Search['doc']['relationTo'], value: string): Search['doc'] => {
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

  return categories.reduce(async (previous, category) => {
    const resolved = await previous
    if (typeof category === 'object' && category !== null) {
      const title = category.title ?? ''
      return title.length > 0
        ? [
            ...resolved,
            {
              relationTo: 'categories' as const,
              categoryID: String(category.id),
              title,
            },
          ]
        : resolved
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

    if (
      !foundCategory ||
      typeof foundCategory.title !== 'string' ||
      foundCategory.title.length === 0
    ) {
      return resolved
    }

    return [
      ...resolved,
      {
        relationTo: 'categories' as const,
        categoryID: String(foundCategory.id),
        title: foundCategory.title,
      },
    ]
  }, Promise.resolve<NonNullable<SearchReindexDoc['categories']>>([]))
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
          image: toStringID(doc.meta.image),
        }
      : undefined,
    categories: resolvedCategories,
    priority: 0,
  }
}

const prepareSearchCollection = async (
  service: SearchReindexService,
  collection: SearchIndexedCollectionSlug,
): Promise<SearchReindexDoc[]> => {
  const docs = await loadAllDocs(service, collection)
  const publishedDocs = docs.filter((doc) => doc._status !== 'draft')
  return publishedDocs.reduce(
    async (previous, doc) => [
      ...(await previous),
      await buildSearchReindexDoc(service, collection, doc),
    ],
    Promise.resolve<SearchReindexDoc[]>([]),
  )
}

export const reindexSearch = async (
  service: SearchReindexService,
): Promise<Array<{ collection: SearchIndexedCollectionSlug; count: number }>> => {
  const prepared = await indexedCollections.reduce(
    async (previous, collection) => [
      ...(await previous),
      { collection, docs: await prepareSearchCollection(service, collection) },
    ],
    Promise.resolve<Array<{ collection: SearchIndexedCollectionSlug; docs: SearchReindexDoc[] }>>(
      [],
    ),
  )
  await service.payload.replace(prepared.flatMap((item) => item.docs))
  return prepared.map((item) => ({ collection: item.collection, count: item.docs.length }))
}
