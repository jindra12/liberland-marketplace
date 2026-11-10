import { describe, expect, it, vi } from 'vitest'
import { mockDeep } from 'vitest-mock-extended'
import type { Collection } from 'mongodb'
import type { Payload } from 'payload'
import { getAnalyticsCollection, type AnalyticsEventDocument } from '@/utilities/analytics/database'
import { getAnalyticsDashboardData } from '@/utilities/analytics/reporting'

vi.mock('@/utilities/analytics/database', () => ({
  getAnalyticsCollection: vi.fn(),
  ensureAnalyticsSchema: vi.fn(),
}))

describe('Analytics report query budgets', () => {
  it('caps a caller-supplied recent-events page before issuing a database query', async () => {
    const collection = mockDeep<Collection<AnalyticsEventDocument>>()
    const aggregate = mockDeep<ReturnType<Collection<AnalyticsEventDocument>['aggregate']>>()
    aggregate.toArray.mockResolvedValue([])
    collection.aggregate.mockReturnValue(aggregate)
    collection.countDocuments.mockResolvedValue(0)
    const cursor = mockDeep<ReturnType<Collection<AnalyticsEventDocument>['find']>>()
    cursor.sort.mockReturnThis()
    cursor.skip.mockReturnThis()
    cursor.limit.mockReturnThis()
    cursor.toArray.mockResolvedValue([])
    collection.find.mockReturnValue(cursor)
    vi.mocked(getAnalyticsCollection).mockResolvedValue(collection)
    await getAnalyticsDashboardData({ payload: mockDeep<Payload>(), days: 1, recentLimit: 10001 })
    expect(cursor.limit).toHaveBeenCalledTimes(1)
    expect(cursor.limit.mock.calls[0][0]).toBeLessThanOrEqual(1000)
  })
})
