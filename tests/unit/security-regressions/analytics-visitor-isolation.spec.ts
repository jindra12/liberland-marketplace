import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockDeep } from 'vitest-mock-extended'
import { ObjectId, type Collection } from 'mongodb'
import type { PayloadRequest } from 'payload'
import type { AnalyticsEventDocument } from '@/utilities/analytics/database'
import { getAnalyticsCollection } from '@/utilities/analytics/database'
import { trackAnalyticsRequest } from '@/utilities/analytics/tracking'

vi.mock('@/utilities/analytics/database', () => ({
  getAnalyticsCollection: vi.fn(),
  ensureAnalyticsSchema: vi.fn(),
}))

describe('Anonymous analytics visitor isolation', () => {
  afterEach(() => vi.clearAllMocks())

  it('does not merge different anonymous visitors into the same unknown-IP identity', async () => {
    const collection = mockDeep<Collection<AnalyticsEventDocument>>()
    collection.insertOne.mockResolvedValue({ acknowledged: true, insertedId: new ObjectId() })
    collection.findOne.mockResolvedValue(null)
    vi.mocked(getAnalyticsCollection).mockResolvedValue(collection)
    await ['visitor-alice', 'visitor-bob'].reduce(async (previous, distinctId) => {
      await previous
      const req = mockDeep<PayloadRequest>()
      req.user = null
      Object.assign(req, { ip: undefined })
      Object.assign(req, { headers: new Headers() })
      await trackAnalyticsRequest({ input: { type: 'page_view', distinctId, metadata: {} }, req })
    }, Promise.resolve())
    expect(collection.insertOne).toHaveBeenCalledTimes(2)
    const visitors = collection.insertOne.mock.calls.map(([document]) => document.visitor_id)
    expect(new Set(visitors).size).toBe(2)
  })
})
