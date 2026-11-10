import { describe, expect, it, vi } from 'vitest'
import { ventureChainIndexEndpoint } from '@/endpoints/ventureChainIndex'
import { syncVentureIndex } from '@/venture/indexUtils'
import { createVentureIndexRequest } from './venture-index/utils'

vi.mock('@/venture/indexUtils', () => ({ syncVentureIndex: vi.fn() }))

describe('Public venture indexing request budget', () => {
  it('does not trigger a new paid RPC synchronization for every sequential anonymous read', async () => {
    const req = createVentureIndexRequest('venture')
    vi.mocked(syncVentureIndex).mockResolvedValue({
      pools: [],
      proposals: [],
      lastBlock: 100,
      blockHash: `0x${'11'.repeat(32)}`,
      hasMore: false,
    })
    await Array.from({ length: 10 }).reduce(async (previous) => {
      await previous
      await ventureChainIndexEndpoint.handler(req)
    }, Promise.resolve())
    expect(vi.mocked(syncVentureIndex).mock.calls.length).toBeLessThanOrEqual(1)
  })

  it('advances unfinished backfill pages instead of repeatedly serving the cached cursor', async () => {
    const req = createVentureIndexRequest('backfill-venture')
    const snapshot = { pools: [], proposals: [], lastBlock: 100, blockHash: `0x${'11'.repeat(32)}`, hasMore: true }
    vi.mocked(syncVentureIndex).mockReset()
    vi.mocked(syncVentureIndex).mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce({ ...snapshot, lastBlock: 200, hasMore: false })
    const first = await ventureChainIndexEndpoint.handler(req)
    expect(await first.json()).toMatchObject({ lastBlock: 100, hasMore: true })
    const second = await ventureChainIndexEndpoint.handler(req)
    expect(await second.json()).toMatchObject({ lastBlock: 200, hasMore: false })
    expect(syncVentureIndex).toHaveBeenCalledTimes(2)
  })

  it('checks document visibility again before returning an already cached snapshot', async () => {
    const req = createVentureIndexRequest('private-venture')
    vi.mocked(syncVentureIndex).mockReset()
    vi.mocked(syncVentureIndex).mockResolvedValue({ pools: [], proposals: [],
      lastBlock: 100, blockHash: `0x${'11'.repeat(32)}`, hasMore: false })
    expect((await ventureChainIndexEndpoint.handler(req)).status).toBe(200)
    req.payload.findByID.mockRejectedValue(new Error('The venture is no longer readable.'))
    expect((await ventureChainIndexEndpoint.handler(req)).status).not.toBe(200)
    expect(syncVentureIndex).toHaveBeenCalledTimes(1)
  })
})
