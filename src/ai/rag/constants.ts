export const RAG_COLLECTIONS = ['jobs', 'companies', 'identities', 'products', 'startups', 'posts'] as const

export type RagCollection = (typeof RAG_COLLECTIONS)[number]

export const RAG_INDEX_TTL_MS = 10 * 60 * 1000
export const RAG_DEFAULT_LIMIT = 8
export const RAG_MAX_LIMIT = 20
