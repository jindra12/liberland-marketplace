import { describe, expect, it } from 'vitest'

import { calculateContentRankScore, computeContentRanking } from '@/hooks/computeContentRanking'

describe('computeContentRanking', () => {
  it('ranks fresher likes above stale likes with the same baseline signals', () => {
    const now = new Date('2026-04-16T12:00:00.000Z')

    const freshScore = calculateContentRankScore({
      completenessScore: 4,
      createdAt: '2026-04-10T12:00:00.000Z',
      lastLikeAt: '2026-04-16T11:00:00.000Z',
      likeCount: 9,
      now,
      subscriberCount: 3,
    })

    const staleScore = calculateContentRankScore({
      completenessScore: 4,
      createdAt: '2026-04-10T12:00:00.000Z',
      lastLikeAt: '2026-04-11T11:00:00.000Z',
      likeCount: 9,
      now,
      subscriberCount: 3,
    })

    expect(freshScore).toBeGreaterThan(staleScore)
  })

  it('gives higher scores to more liked and subscribed content', () => {
    const now = new Date('2026-04-16T12:00:00.000Z')

    const strongScore = calculateContentRankScore({
      completenessScore: 5,
      createdAt: '2026-04-15T12:00:00.000Z',
      lastLikeAt: '2026-04-16T10:00:00.000Z',
      likeCount: 25,
      now,
      subscriberCount: 30,
    })

    const weakScore = calculateContentRankScore({
      completenessScore: 2,
      createdAt: '2026-04-15T12:00:00.000Z',
      lastLikeAt: '2026-04-16T10:00:00.000Z',
      likeCount: 2,
      now,
      subscriberCount: 1,
    })

    expect(strongScore).toBeGreaterThan(weakScore)
  })

  it('recomputes completeness from merged data without dropping cached ranking signals', () => {
    const hook = computeContentRanking({
      fieldPaths: ['title', 'body', 'tags'],
    })

    const result = hook({
      collection: undefined as never,
      context: {},
      data: {
        subscriberCount: 12,
      },
      operation: 'update',
      originalDoc: {
        body: 'Body text',
        createdAt: '2026-04-10T12:00:00.000Z',
        lastLikeAt: '2026-04-16T11:30:00.000Z',
        likeCount: 5,
        tags: ['one', 'two'],
        title: 'Ranked content',
        updatedAt: '2026-04-16T12:00:00.000Z',
      },
      req: undefined as never,
    })

    expect(result.completenessScore).toBe(3)
    expect(result.contentRankScore).toBeGreaterThan(0)
    expect(result.lastLikeAt).toBe('2026-04-16T11:30:00.000Z')
    expect(result.subscriberCount).toBe(12)
  })
})
