import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAiRepostCycle } from '@/ai/reposts/run'
import { createRepostFixture } from './ai/utils'
import { discoverBatchRepostPlans, discoverFallbackPosts } from '@/ai/reposts/utils'

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  createLocalReq: vi.fn(),
}))
vi.mock('node:dns/promises', () => ({
  lookup: async () => [{ address: '93.184.216.34', family: 4 }],
}))
vi.mock('@/ai/reposts/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/ai/reposts/utils')>()),
  discoverBatchRepostPlans: vi.fn(),
  discoverFallbackPosts: vi.fn(),
}))

describe('AI repost run integrity', () => {
  beforeEach(() => vi.stubEnv('CHATGPT_KEY', 'unit-test-key-no-network'))
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('does not automatically publish a model candidate that explicitly reports attribution concerns', async () => {
    const fixture = createRepostFixture()
    vi.mocked(discoverBatchRepostPlans).mockResolvedValue(
      fixture.plans.map((plan) => ({
        ...plan,
        decision: { ...plan.decision, concernFlags: ['company_attribution_uncertain'] },
      })),
    )
    await runAiRepostCycle({ payload: fixture.payload })
    expect(fixture.posts).toHaveLength(0)
  })

  it('ignores a model-selected company outside the eligible company list', async () => {
    const fixture = createRepostFixture()
    vi.mocked(discoverBatchRepostPlans).mockResolvedValue(
      fixture.plans.map((plan) => ({ ...plan, companyId: 'not-in-the-eligible-batch' })),
    )
    await runAiRepostCycle({ payload: fixture.payload })
    expect(fixture.posts).toHaveLength(0)
  })

  it('applies publication concern checks to the unrestricted fallback too', async () => {
    const fixture = createRepostFixture()
    vi.mocked(discoverBatchRepostPlans).mockResolvedValue([])
    vi.mocked(discoverFallbackPosts).mockResolvedValue(
      fixture.plans.map((plan) => ({
        ...plan,
        decision: { ...plan.decision, concernFlags: ['unsupported_claim'] },
      })),
    )
    await runAiRepostCycle({ payload: fixture.payload })
    expect(fixture.posts).toHaveLength(0)
  })

  it('still uploads a safe public image for a publishable article', async () => {
    const fixture = createRepostFixture('https://news.example/image.svg')
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" /></svg>',
            { headers: { 'content-type': 'image/svg+xml' } },
          ),
        ),
    )
    await runAiRepostCycle({ payload: fixture.payload })
    expect(fixture.payload.create).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'media' }),
    )
    expect(fixture.posts).toHaveLength(1)
  })

  it('does not publish the same company article again on the next scan', async () => {
    const fixture = createRepostFixture()
    await runAiRepostCycle({ payload: fixture.payload })
    await runAiRepostCycle({ payload: fixture.payload })
    expect(fixture.posts).toHaveLength(1)
  })

  it('does not duplicate publishing when cron and an administrator start overlapping runs', async () => {
    const fixture = createRepostFixture()
    await Promise.all([
      runAiRepostCycle({ payload: fixture.payload }),
      runAiRepostCycle({ payload: fixture.payload }),
    ])
    expect(fixture.posts).toHaveLength(1)
  })

  it('does not fetch a loopback image URL returned with an otherwise public article', async () => {
    const fixture = createRepostFixture('http://127.0.0.1/private-image')
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>', {
        headers: { 'content-type': 'image/svg+xml' },
      }),
    )
    vi.stubGlobal('fetch', fetch)
    await runAiRepostCycle({ payload: fixture.payload })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not upload an image returned after a redirect into a private network', async () => {
    const fixture = createRepostFixture('https://news.example/image')
    const response = new Response(null, {
      status: 302,
      headers: { location: 'http://127.0.0.1/private-image' },
    })
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>().mockResolvedValue(response))
    await runAiRepostCycle({ payload: fixture.payload })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fixture.payload.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'media' }),
    )
  })
})
