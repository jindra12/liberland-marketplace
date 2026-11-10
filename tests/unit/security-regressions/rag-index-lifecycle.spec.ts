import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'
import { EngineResponse, VectorStoreIndex } from 'llamaindex'
import { createLocalReq, type PaginatedDocs, type PayloadRequest } from 'payload'
import type { Company } from '@/payload-types'
import { invalidateRagIndex, searchRag } from '@/ai/rag/service'
import { RAG_INDEX_TTL_MS } from '@/ai/rag/constants'

vi.mock('@/security/utils', () => ({ consumeRagQuota: vi.fn() }))
vi.mock('@llamaindex/openai', () => ({ OpenAI: vi.fn(), OpenAIEmbedding: vi.fn() }))
vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  createLocalReq: vi.fn(),
}))

describe('RAG index lifecycle', () => {
  beforeEach(() => {
    invalidateRagIndex()
    vi.stubEnv('CHATGPT_KEY', 'unit-test-key-no-network')
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://backend.example')
  })
  afterEach(() => {
    invalidateRagIndex()
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('backs off repeated embedding failures instead of immediately rebuilding again', async () => {
    const req = mockDeep<PayloadRequest>()
    req.user = null
    req.payload.find.mockResolvedValue(Object.assign(mock<PaginatedDocs<Company>>(), { docs: [] }))
    vi.mocked(createLocalReq).mockResolvedValue(req)
    const build = vi
      .spyOn(VectorStoreIndex, 'fromDocuments')
      .mockRejectedValue(new Error('Embedding service unavailable'))
    await expect(searchRag(req, { query: 'fixture' })).rejects.toThrow(
      'Embedding service unavailable',
    )
    await expect(searchRag(req, { query: 'fixture' })).rejects.toThrow(
      'Embedding service unavailable',
    )
    expect(build).toHaveBeenCalledTimes(1)
  })

  it('loads companies beyond the first database page before embedding the index', async () => {
    const req = mockDeep<PayloadRequest>()
    req.user = null
    vi.mocked(createLocalReq).mockResolvedValue(req)
    const companies = Array.from({ length: 1001 }, (_, index) =>
      mock<Company>({ id: `company-${index}`, name: `Company ${index}` }),
    )
    req.payload.find.mockImplementation(async (options) =>
      Object.assign(mock<PaginatedDocs<Company>>(), {
        docs:
          options.collection !== 'companies'
            ? []
            : options.pagination === false
              ? companies
              : options.page === 2
                ? companies.slice(1000)
                : companies.slice(0, 1000),
        hasNextPage:
          options.collection === 'companies' && options.page !== 2 && options.pagination !== false,
        nextPage: 2,
      }),
    )
    const build = vi
      .spyOn(VectorStoreIndex, 'fromDocuments')
      .mockRejectedValue(new Error('Stop before external embeddings'))
    await expect(searchRag(req, { query: 'fixture' })).rejects.toThrow(
      'Stop before external embeddings',
    )
    expect(build.mock.calls[0][0]).toHaveLength(1001)
  })

  it('serves the last usable index when refreshing expired embeddings fails', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const req = mockDeep<PayloadRequest>()
    req.user = null
    req.payload.find.mockResolvedValue(Object.assign(mock<PaginatedDocs<Company>>(), { docs: [] }))
    vi.mocked(createLocalReq).mockResolvedValue(req)
    const index = mockDeep<VectorStoreIndex>()
    const engine = mockDeep<ReturnType<VectorStoreIndex['asQueryEngine']>>()
    engine.query.mockResolvedValue(
      EngineResponse.fromResponse('Previously indexed answer', false, []),
    )
    index.asQueryEngine.mockReturnValue(engine)
    vi.spyOn(VectorStoreIndex, 'fromDocuments')
      .mockResolvedValueOnce(index)
      .mockRejectedValueOnce(new Error('Embedding service unavailable during refresh'))
    await expect(searchRag(req, { query: 'initial query' })).resolves.toMatchObject({
      answer: 'Previously indexed answer',
    })
    vi.setSystemTime(Date.now() + RAG_INDEX_TTL_MS + 1)
    await expect(searchRag(req, { query: 'query during outage' })).resolves.toMatchObject({
      answer: 'Previously indexed answer',
    })
  })
})
