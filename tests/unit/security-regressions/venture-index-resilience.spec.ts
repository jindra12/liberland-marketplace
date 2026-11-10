import { describe, expect, it, vi } from 'vitest'
import { syncVentureIndex } from '@/venture/indexUtils'
import { createVentureIndexFixture } from './venture-index/utils'

vi.mock('@ethersproject/contracts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ethersproject/contracts')>()),
  Contract: vi.fn(),
}))
vi.mock('@ethersproject/providers', () => ({ StaticJsonRpcProvider: vi.fn() }))

describe('Venture indexing resilience', () => {
  it.each(['symbol', 'decimals'] as const)(
    'keeps unrelated valid pools when an untrusted token reverts its %s lookup',
    async (method) => {
      const fixture = createVentureIndexFixture(method)
      const result = await syncVentureIndex(fixture.req, 'venture', fixture.deployment)
      expect(result).toMatchObject({
        pools: expect.arrayContaining([expect.objectContaining({ id: fixture.goodPoolId })]),
      })
      expect(result.pools).toHaveLength(1)
      expect(fixture.req.payload.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ ventureID: 'venture', err: expect.any(Error) }),
      )
    },
  )

  it('indexes both pools when their token metadata is available', async () => {
    const fixture = createVentureIndexFixture()
    const result = await syncVentureIndex(fixture.req, 'venture', fixture.deployment)
    expect(result.pools).toHaveLength(2)
    expect(result.lastBlock).toBe(100)
    expect(fixture.req.payload.create).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'venture-chain-indexes' }),
    )
  })
})
