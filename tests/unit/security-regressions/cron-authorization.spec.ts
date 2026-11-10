import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockDeep } from 'vitest-mock-extended'
import { createPayloadRequest, getPayload, type Payload, type PayloadRequest } from 'payload'
import { GET as generatePosts } from '@/app/api/cron/ai-reposts/route'
import { GET as refreshRates } from '@/app/api/cron/crypto-rates/route'
import { GET as reindex } from '@/app/api/cron/reindex-search/route'

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('@/ai/reposts', () => ({ loadAiRepostRunner: async () => null }))
vi.mock('@/crypto/rates/cache', () => ({ refreshCryptoRateCache: vi.fn() }))
vi.mock('@/search/reindex', () => ({ reindexSearch: vi.fn(async () => ({})) }))
vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  getPayload: vi.fn(),
  createPayloadRequest: vi.fn(),
}))

describe('Cron credential isolation', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', '')
    vi.stubEnv('PAYLOAD_SECRET', 'unit-test-signing-secret')
    vi.mocked(getPayload).mockResolvedValue(mockDeep<Payload>())
    vi.mocked(createPayloadRequest).mockResolvedValue(mockDeep<PayloadRequest>())
  })

  it.each([
    { name: 'post generation', handler: generatePosts },
    { name: 'exchange-rate refresh', handler: refreshRates },
    { name: 'search reindex', handler: reindex },
  ])(
    'does not accept the CMS signing secret as a cron credential for $name',
    async ({ handler }) => {
      const response = await handler(
        new Request('https://backend.example/api/cron/test', {
          headers: { authorization: 'Bearer unit-test-signing-secret' },
        }),
      )
      expect(response.status).not.toBe(200)
    },
  )
})
