import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, Plugin } from 'payload'
import type { DocToSync } from '@payloadcms/plugin-search/types'

import type { Search } from '@/payload-types'
import { beforeSyncWithSearch } from '@/search/beforeSync'

const SEARCH_COLLECTION = 'search'

type SearchIndexedCollectionSlug = 'jobs' | 'companies' | 'identities' | 'products' | 'startups' | 'posts'
type SearchDocToSync = Omit<DocToSync, 'doc'> & {
  doc: Search['doc']
}

const SEARCH_INDEXED_COLLECTIONS = new Set<SearchIndexedCollectionSlug>([
  'jobs',
  'companies',
  'identities',
  'products',
  'startups',
  'posts',
])

const searchSyncSettings = {
  deleteDrafts: true,
  syncDrafts: false,
}

const isSearchSyncHook = (hook: unknown): boolean => {
  const hookName = typeof hook === 'function' ? hook.name : undefined

  return hookName === 'syncWithSearch' || hookName === 'deleteFromSearch'
}

const getResolvedTitle = (doc: Record<string, unknown>, searchDoc: DocToSync): string => {
  const title = doc.title
  const name = doc.name
  const meta = doc.meta as { title?: string | null } | undefined

  return (
    (typeof title === 'string' && title) ||
    (typeof name === 'string' && name) ||
    (typeof meta?.title === 'string' && meta.title) ||
    searchDoc.title ||
    ''
  )
}

const buildSearchDoc = async (args: {
  collectionSlug: SearchIndexedCollectionSlug
  doc: Record<string, unknown>
  req: Parameters<CollectionAfterChangeHook>[0]['req']
}): Promise<SearchDocToSync> => {
  const baseSearchDoc: DocToSync = {
    doc: {
      relationTo: args.collectionSlug,
      value: String(args.doc.id),
    },
    title: '',
  }
  const preparedSearchDoc = await beforeSyncWithSearch({
    originalDoc: args.doc,
    payload: args.req.payload,
    req: args.req,
    searchDoc: baseSearchDoc,
  })

  return {
    ...preparedSearchDoc,
    title: getResolvedTitle(args.doc, preparedSearchDoc),
    meta: {
      ...preparedSearchDoc.meta,
      title: getResolvedTitle(args.doc, preparedSearchDoc),
      description: preparedSearchDoc.meta?.description,
      image: preparedSearchDoc.meta?.image ?? null,
    },
  } as SearchDocToSync
}

const syncSearchIndexForCreateOrUpdate = async (args: {
  collectionSlug: SearchIndexedCollectionSlug
  doc: Record<string, unknown>
  operation: 'create' | 'update'
  req: Parameters<CollectionAfterChangeHook>[0]['req']
}): Promise<void> => {
  const searchDocQuery = await args.req.payload.find({
    collection: SEARCH_COLLECTION,
    depth: 0,
    overrideAccess: true,
    where: {
      'doc.relationTo': {
        equals: args.collectionSlug,
      },
      'doc.value': {
        equals: String(args.doc.id),
      },
    },
  })

  const docs = searchDocQuery.docs as Search[]
  const [foundDoc, ...duplicativeDocs] = docs
  const preparedDoc = await buildSearchDoc({
    collectionSlug: args.collectionSlug,
    doc: args.doc,
    req: args.req,
  })

  if (duplicativeDocs.length > 0) {
    const duplicativeDocIDs = duplicativeDocs
      .map((each) => each.id)
      .filter((id): id is string => typeof id === 'string')

    if (duplicativeDocIDs.length > 0) {
      await args.req.payload.delete({
        collection: SEARCH_COLLECTION,
        depth: 0,
        overrideAccess: true,
        where: {
          id: {
            in: duplicativeDocIDs,
          },
        },
      })
    }
  }

  const isDraft = typeof args.doc._status === 'string' && args.doc._status === 'draft'

  if (isDraft && !searchSyncSettings.syncDrafts) {
    if (foundDoc) {
      await args.req.payload.delete({
        collection: SEARCH_COLLECTION,
        depth: 0,
        overrideAccess: true,
        where: {
          'doc.relationTo': {
            equals: args.collectionSlug,
          },
          'doc.value': {
            equals: String(args.doc.id),
          },
        },
      })
    }

    return
  }

  if (foundDoc) {
    await args.req.payload.update({
      collection: SEARCH_COLLECTION,
      id: foundDoc.id,
      data: {
        ...preparedDoc,
        priority: foundDoc.priority ?? 0,
      },
      depth: 0,
      overrideAccess: true,
    })
    return
  }

  await args.req.payload.create({
    collection: SEARCH_COLLECTION,
    data: {
      ...preparedDoc,
      priority: 0,
    },
    depth: 0,
    overrideAccess: true,
  })
}

const syncSearchIndexForDelete = async (args: {
  collectionSlug: SearchIndexedCollectionSlug
  doc: Parameters<CollectionAfterDeleteHook>[0]['doc']
  req: Parameters<CollectionAfterDeleteHook>[0]['req']
}): Promise<void> => {
  await args.req.payload.delete({
    collection: SEARCH_COLLECTION,
    depth: 0,
    overrideAccess: true,
    where: {
      'doc.relationTo': {
        equals: args.collectionSlug,
      },
      'doc.value': {
        equals: String(args.doc?.id),
      },
    },
  })
}

const scheduleSearchCreateOrUpdate = (args: {
  collectionSlug: SearchIndexedCollectionSlug
  doc: Parameters<CollectionAfterChangeHook>[0]['doc']
  operation: Parameters<CollectionAfterChangeHook>[0]['operation']
  req: Parameters<CollectionAfterChangeHook>[0]['req']
}): void => {
  setTimeout(() => {
    ;(async () => {
      try {
        await syncSearchIndexForCreateOrUpdate({
          collectionSlug: args.collectionSlug,
          doc: args.doc,
          operation: args.operation,
          req: args.req,
        })
      } catch (error) {
        args.req.payload.logger.error({
          err: error,
          msg: `Deferred search sync failed for ${args.collectionSlug} ${args.operation}.`,
        })
      }
    })()
  }, 0)
}

const scheduleSearchDelete = (args: {
  collectionSlug: SearchIndexedCollectionSlug
  doc: Parameters<CollectionAfterDeleteHook>[0]['doc']
  req: Parameters<CollectionAfterDeleteHook>[0]['req']
}): void => {
  setTimeout(() => {
    ;(async () => {
      try {
        await syncSearchIndexForDelete({
          collectionSlug: args.collectionSlug,
          doc: args.doc,
          req: args.req,
        })
      } catch (error) {
        args.req.payload.logger.error({
          err: error,
          msg: `Deferred search delete failed for ${args.collectionSlug}.`,
        })
      }
    })()
  }, 0)
}

const makeAfterChangeHook =
  (collectionSlug: SearchIndexedCollectionSlug): CollectionAfterChangeHook =>
  async ({ doc, operation, req }) => {
    scheduleSearchCreateOrUpdate({
      collectionSlug,
      doc,
      operation,
      req,
    })

    return doc
  }

const makeAfterDeleteHook =
  (collectionSlug: SearchIndexedCollectionSlug): CollectionAfterDeleteHook =>
  async ({ doc, req }) => {
    scheduleSearchDelete({
      collectionSlug,
      doc,
      req,
    })

    return doc
  }

export const deferSearchSyncPlugin: Plugin = (config) => ({
  ...config,
  collections: (config.collections ?? []).map((collection) => {
    const collectionSlug = collection.slug as SearchIndexedCollectionSlug

    if (!SEARCH_INDEXED_COLLECTIONS.has(collectionSlug)) {
      return collection
    }

    const afterChangeHooks = (collection.hooks?.afterChange ?? []).filter((hook) => !isSearchSyncHook(hook))
    const afterDeleteHooks = (collection.hooks?.afterDelete ?? []).filter((hook) => !isSearchSyncHook(hook))

    return {
      ...collection,
      hooks: {
        ...collection.hooks,
        afterChange: [...afterChangeHooks, makeAfterChangeHook(collectionSlug)],
        afterDelete: [...afterDeleteHooks, makeAfterDeleteHook(collectionSlug)],
      },
    }
  }),
})
