import { createLocalReq, type Payload, type Where } from 'payload'
import type { SitemapCollection, SitemapSource } from './types'
import { SITEMAP_PAGE_SIZE } from './constants'

export const publicSitemapWhere = (
  collection: SitemapCollection,
  after?: string | number,
): Where => ({
  and: [
    ...(['identities', 'comments'].includes(collection)
      ? []
      : [{ _status: { equals: 'published' } }]),
    ...(collection === 'companies' ? [{ isPrivate: { equals: false } }] : []),
    ...(after ? [{ id: { greater_than: after } }] : []),
  ],
})

export const createSitemapSource = async (payload: Payload): Promise<SitemapSource> => {
  const req = await createLocalReq({}, payload)
  return {
    readRecords: async (collection, after) => {
      const result = await payload.find({
        collection,
        req,
        overrideAccess: false,
        draft: false,
        depth: 0,
        limit: SITEMAP_PAGE_SIZE,
        pagination: false,
        sort: 'id',
        select: { updatedAt: true },
        where: publicSitemapWhere(collection, after),
      })
      return result.docs
    },
    readSyndicatedServers: async () => {
      const result = await payload.find({
        collection: 'syndications',
        req,
        overrideAccess: false,
        draft: false,
        depth: 0,
        limit: 1000,
        pagination: false,
        where: { _status: { equals: 'published' } },
        select: { url: true },
      })
      return result.docs.map((server) => server.url)
    },
  }
}
