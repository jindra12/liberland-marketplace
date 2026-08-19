import type { RagCollection } from './constants'

export type RagSearchRequest = {
  query: string
  limit?: number
}

export type RagSource = {
  collection: RagCollection
  id: string
  title: string
  slug: string | null
  serverUrl: string
}

export type RagSearchResponse = {
  answer: string
  sources: RagSource[]
}

export type RagRecord = {
  id: string | number
  title?: string | null
  name?: string | null
  slug?: string | null
  description?: string | null
  meta?: {
    title?: string | null
    description?: string | null
  } | null
}
