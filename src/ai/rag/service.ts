import { Document, Settings, VectorStoreIndex } from 'llamaindex'
import { OpenAI } from '@llamaindex/openai'
import { createPersistedEmbeddingModel } from './utils'
import { createLocalReq, type PayloadRequest } from 'payload'

import { getServerSideURL } from '@/utilities/getURL'
import { consumeRagQuota } from '@/security/utils'

import {
  RAG_COLLECTIONS,
  RAG_DEFAULT_LIMIT,
  RAG_INDEX_TTL_MS,
  RAG_INDEX_MAX_STALE_MS,
  RAG_BUILD_RETRY_DELAY_MS,
  RAG_MAX_LIMIT,
  type RagCollection,
} from './constants'
import type { RagIndex, RagBuildFailure, RagRecord, RagSearchRequest, RagSearchResponse, RagSource } from './types'

type RagDocumentMetadata = {
  collection: RagCollection
  id: string
  title: string
  slug: string | null
  serverUrl: string
}

let cachedIndex: Promise<RagIndex> | null = null
let usableIndex: RagIndex | null = null
let buildFailure: RagBuildFailure | null = null

const getOpenAIKey = (): string => {
  const key = process.env.CHATGPT_KEY

  if (!key) {
    throw new Error('CHATGPT_KEY is required for RAG.')
  }

  return key
}

const getLimit = (limit: number | undefined): number => {
  if (!limit || !Number.isFinite(limit)) {
    return RAG_DEFAULT_LIMIT
  }

  return Math.min(Math.max(Math.floor(limit), 1), RAG_MAX_LIMIT)
}

const getTitle = (record: RagRecord): string => {
  return record.title || record.name || record.meta?.title || record.meta?.description || 'Untitled item'
}

const getDescription = (record: RagRecord): string => {
  return record.description || record.meta?.description || ''
}

const getRecordText = (collection: RagCollection, record: RagRecord): string => {
  const title = getTitle(record)
  const description = getDescription(record)
  const structuredFields = Object.entries(record)
    .filter(([key]) => !['id', 'description', 'meta'].includes(key))
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n')

  return [`Type: ${collection}`, `Title: ${title}`, description, structuredFields]
    .filter((value) => value.length > 0)
    .join('\n')
}

const getRecords = async (req: PayloadRequest, collection: RagCollection, page = 1): Promise<RagRecord[]> => {
  const result = await req.payload.find({
    collection,
    depth: 1,
    limit: 1000,
    page,
    sort: 'id',
    overrideAccess: false,
    req,
  })

  if (result.hasNextPage && result.nextPage && result.nextPage > page) {
    return [...result.docs, ...await getRecords(req, collection, result.nextPage)]
  }
  return result.docs
}

const createDocuments = async (req: PayloadRequest): Promise<Document<RagDocumentMetadata>[]> => {
  const serverUrl = getServerSideURL()
  const publicReq = await createLocalReq({}, req.payload)
  const records = await Promise.all(
    RAG_COLLECTIONS.map(async (collection) => ({
      collection,
      records: await getRecords(publicReq, collection),
    })),
  )

  return records.flatMap(({ collection, records: collectionRecords }) =>
    collectionRecords.map((record) => {
      const metadata: RagDocumentMetadata = {
        collection,
        id: String(record.id),
        title: getTitle(record),
        slug: record.slug || null,
        serverUrl,
      }

      return new Document<RagDocumentMetadata>({
        id_: `${collection}:${metadata.id}`,
        metadata,
        text: getRecordText(collection, record),
      })
    }),
  )
}

const buildIndex = async (req: PayloadRequest): Promise<RagIndex> => {
  const apiKey = getOpenAIKey()
  Settings.llm = new OpenAI({ apiKey, model: process.env.RAG_MODEL || 'gpt-4o-mini' })
  Settings.embedModel = createPersistedEmbeddingModel(req.payload, {
    apiKey,
    model: process.env.RAG_EMBEDDING_MODEL || 'text-embedding-3-small',
  })

  return {
    createdAt: Date.now(),
    index: await VectorStoreIndex.fromDocuments(await createDocuments(req)),
  }
}

const getIndex = async (req: PayloadRequest): Promise<VectorStoreIndex> => {
  if (usableIndex && Date.now() - usableIndex.createdAt < RAG_INDEX_TTL_MS) {
    return usableIndex.index
  }
  if (buildFailure && Date.now() < buildFailure.retryAt) {
    if (usableIndex && Date.now() - usableIndex.createdAt < RAG_INDEX_MAX_STALE_MS) {
      return usableIndex.index
    }
    throw buildFailure.error
  }

  const nextIndex = cachedIndex || buildIndex(req)
  cachedIndex = nextIndex

  try {
    const built = await nextIndex
    if (cachedIndex === nextIndex) {
      usableIndex = built
      buildFailure = null
    }
    return built.index
  } catch (error) {
    if (cachedIndex === nextIndex) {
      buildFailure = { error: error instanceof Error ? error : new Error(String(error)),
        retryAt: Date.now() + RAG_BUILD_RETRY_DELAY_MS }
      req.payload.logger.error({ err: error, msg: 'RAG index refresh failed; rebuilds are temporarily backed off.' })
    }
    if (usableIndex && Date.now() - usableIndex.createdAt < RAG_INDEX_MAX_STALE_MS) {
      return usableIndex.index
    }
    throw error
  } finally {
    if (cachedIndex === nextIndex) {
      cachedIndex = null
    }
  }
}

const toSource = (metadata: RagDocumentMetadata): RagSource => ({
  collection: metadata.collection,
  id: metadata.id,
  title: metadata.title,
  slug: metadata.slug,
  serverUrl: metadata.serverUrl,
})

export const searchRag = async (req: PayloadRequest, input: RagSearchRequest): Promise<RagSearchResponse> => {
  const query = input.query.trim()

  if (!query) {
    throw new Error('A search query is required.')
  }

  await consumeRagQuota(req.headers, req.user ? `${req.user.collection}:${req.user.id}` : undefined)
  const limit = getLimit(input.limit)
  const queryEngine = (await getIndex(req)).asQueryEngine({ similarityTopK: limit })
  const response = await queryEngine.query({ query })
  const sources = (response.sourceNodes || [])
    .map((node) => node.node.metadata as RagDocumentMetadata)
    .filter((metadata) => metadata.collection && metadata.id)
    .slice(0, limit)
    .map(toSource)

  return {
    answer: response.response,
    sources,
  }
}

export const invalidateRagIndex = (): void => {
  cachedIndex = null
  usableIndex = null
  buildFailure = null
}
