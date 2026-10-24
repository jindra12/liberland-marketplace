import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimiterRes } from 'rate-limiter-flexible'

import {
  CLIENT_RAG_SEARCHES_PER_HOUR,
  CLIENT_REQUESTS_PER_MINUTE,
  GLOBAL_RAG_SEARCHES_PER_HOUR,
  GLOBAL_REQUESTS_PER_MINUTE,
} from '@/security/constants'

const createPayloadRequest = vi.hoisted(() => vi.fn<() => Promise<{ headers: Headers }>>())
const searchRag = vi.hoisted(() => vi.fn())
const createBackendMcpServer = vi.hoisted(() => vi.fn())
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ createPayloadRequest }))
vi.mock('@/ai/rag/service', () => ({ searchRag }))
vi.mock('@/mcp/server', () => ({ createBackendMcpServer }))

const clientHeaders = (client: number): Headers => new Headers({ 'x-real-ip': `2001:db8::${client}` })
const requestFor = (client: number): Request => new Request('https://backend.example/api/mcp', { headers: clientHeaders(client) })

describe('backend AI and MCP limits', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.stubEnv('VERCEL', '0')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('limits each client and returns a retry delay without blocking other clients', async () => {
    const { limitBackendRequest } = await import('@/security/utils')
    const allowed = await Promise.all(Array.from({ length: CLIENT_REQUESTS_PER_MINUTE }, () => limitBackendRequest(requestFor(1))))
    expect(allowed.every((response) => response === null)).toBe(true)
    const denied = await limitBackendRequest(requestFor(1))
    expect(denied?.status).toBe(429)
    expect(denied?.headers.get('Retry-After')).toBe('60')
    expect(denied?.headers.get('Cache-Control')).toBe('no-store')
    expect(await limitBackendRequest(requestFor(2))).toBeNull()
    await vi.advanceTimersByTimeAsync(60_001)
    expect(await limitBackendRequest(requestFor(1))).toBeNull()
  })

  it('does not let forged X-Forwarded-For values bypass the nginx client limit', async () => {
    const { limitBackendRequest } = await import('@/security/utils')
    await Promise.all(Array.from({ length: CLIENT_REQUESTS_PER_MINUTE }, () => limitBackendRequest(requestFor(1))))
    const headers = clientHeaders(1)
    headers.set('x-forwarded-for', '203.0.113.99')
    expect((await limitBackendRequest(new Request('https://backend.example/api/mcp', { headers })))?.status).toBe(429)
  })

  it('caps total traffic even when callers vary their client identity', async () => {
    const { limitBackendRequest } = await import('@/security/utils')
    const allowed = await Promise.all(Array.from({ length: GLOBAL_REQUESTS_PER_MINUTE }, (_, index) => limitBackendRequest(requestFor(index))))
    expect(allowed.every((response) => response === null)).toBe(true)
    expect((await limitBackendRequest(requestFor(GLOBAL_REQUESTS_PER_MINUTE)))?.status).toBe(429)
  })

  it('limits paid RAG work per client and per verified user across client IPs', async () => {
    const { consumeRagQuota } = await import('@/security/utils')
    await Promise.all(Array.from({ length: CLIENT_RAG_SEARCHES_PER_HOUR }, () => consumeRagQuota(clientHeaders(1))))
    await expect(consumeRagQuota(clientHeaders(1))).rejects.toBeInstanceOf(RateLimiterRes)
    await expect(consumeRagQuota(clientHeaders(2))).resolves.toBeUndefined()
    await Promise.all(Array.from({ length: CLIENT_RAG_SEARCHES_PER_HOUR }, () => consumeRagQuota(clientHeaders(3), 'users:verified-user')))
    await expect(consumeRagQuota(clientHeaders(4), 'users:verified-user')).rejects.toBeInstanceOf(RateLimiterRes)
  })

  it('caps paid RAG work across all callers', async () => {
    const { consumeRagQuota } = await import('@/security/utils')
    await Promise.all(Array.from({ length: GLOBAL_RAG_SEARCHES_PER_HOUR }, (_, index) => consumeRagQuota(clientHeaders(index))))
    await expect(consumeRagQuota(clientHeaders(GLOBAL_RAG_SEARCHES_PER_HOUR))).rejects.toBeInstanceOf(RateLimiterRes)
  })

  it('rejects direct GET and POST search requests before initializing Payload or calling AI', async () => {
    const { limitBackendRequest } = await import('@/security/utils')
    await Promise.all(Array.from({ length: CLIENT_REQUESTS_PER_MINUTE }, () => limitBackendRequest(requestFor(1))))
    const { GET, POST } = await import('@/app/api/ai/search/route')
    const get = await GET(new Request('https://backend.example/api/ai/search?q=jobs', { headers: clientHeaders(1) }))
    const post = await POST(new Request('https://backend.example/api/ai/search', {
      method: 'POST', headers: clientHeaders(1), body: JSON.stringify({ query: 'jobs' }),
    }))
    expect(get.status).toBe(429)
    expect(post.status).toBe(429)
    expect(createPayloadRequest).not.toHaveBeenCalled()
    expect(searchRag).not.toHaveBeenCalled()
  })

  it('returns HTTP 429 and Retry-After when the RAG service rejects the paid-search quota', async () => {
    createPayloadRequest.mockResolvedValue({ headers: clientHeaders(1) })
    searchRag.mockRejectedValue(new RateLimiterRes(0, 30_000, 41, false))
    const { GET } = await import('@/app/api/ai/search/route')
    const response = await GET(new Request('https://backend.example/api/ai/search?q=jobs', { headers: clientHeaders(1) }))
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('30')
    expect(await response.json()).toMatchObject({ retryAfter: 30 })
  })

  it('rejects direct MCP traffic before constructing or executing tools', async () => {
    const { limitBackendRequest } = await import('@/security/utils')
    await Promise.all(Array.from({ length: CLIENT_REQUESTS_PER_MINUTE }, () => limitBackendRequest(requestFor(1))))
    const { POST } = await import('@/app/api/mcp/route')
    const response = await POST(new Request('https://backend.example/api/mcp', {
      method: 'POST', headers: clientHeaders(1), body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
    }))
    expect(response.status).toBe(429)
    expect(createBackendMcpServer).not.toHaveBeenCalled()
  })
})
