import { Document, Settings, VectorStoreIndex } from 'llamaindex'
import { OpenAI, OpenAIEmbedding } from '@llamaindex/openai'
import { createLocalReq, type PayloadRequest } from 'payload'

import { getServerSideURL } from '@/utilities/getURL'

import {
  RAG_COLLECTIONS,
  RAG_DEFAULT_LIMIT,
  RAG_INDEX_TTL_MS,
  RAG_MAX_LIMIT,
  type RagCollection,
} from './constants'
import type { RagRecord, RagSearchRequest, RagSearchResponse, RagSource } from './types'

type RagIndex = {
  createdAt: number
  index: VectorStoreIndex
}

type RagDocumentMetadata = {
  collection: RagCollection
  id: string
  title: string
  slug: string | null
  serverUrl: string
}

let cachedIndex: Promise<RagIndex> | null = null

const getOpenAIKey = (): string => {
  const key = process.env.OPENAI_API_KEY || process.env.CHATGPT_KEY

  if (!key) {
    throw new Error('OPENAI_API_KEY or CHATGPT_KEY is required for RAG.')
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

const getRecords = async (req: PayloadRequest, collection: RagCollection): Promise<RagRecord[]> => {
  const result = await req.payload.find({
    collection,
    depth: 1,
    limit: 1000,
    overrideAccess: false,
    req,
  })

  return result.docs as RagRecord[]
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
  Settings.embedModel = new OpenAIEmbedding({
    apiKey,
    model: process.env.RAG_EMBEDDING_MODEL || 'text-embedding-3-small',
  })

  return {
    createdAt: Date.now(),
    index: await VectorStoreIndex.fromDocuments(await createDocuments(req)),
  }
}

const getIndex = async (req: PayloadRequest): Promise<VectorStoreIndex> => {
  const current = cachedIndex

  if (current) {
    const resolved = await current

    if (Date.now() - resolved.createdAt < RAG_INDEX_TTL_MS) {
      return resolved.index
    }
  }

  cachedIndex = buildIndex(req)
  return (await cachedIndex).index
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
}
