import { ensureAnalyticsSchema, getAnalyticsCollection } from './database'

const DAY_IN_MS = 24 * 60 * 60 * 1000
const PAGE_VIEW_EVENT_TYPES = ['page_view', 'pageview']

type DailyRow = {
  event_day: string
  pageViews: number
  total: number
  uniqueVisitors: number
}

type RecentRow = {
  id: string
  metadata?: {
    route?: null | string
  } | null
  route: null | string
  sessionId: null | string
  timestamp: number
  type: string
  userId: null | string
}

type RouteRow = {
  count: number
  route: string
}

type TypeRow = {
  count: number
  type: string
}

type OverviewRow = {
  eventsLast24Hours: number
  pageViews: number
  totalEvents: number
  uniqueVisitors: number
}

export type AnalyticsOverview = {
  eventsLast24Hours: number
  pageViews: number
  totalEvents: number
  uniqueVisitors: number
}

export type AnalyticsDailyPoint = {
  day: string
  pageViews: number
  total: number
  uniqueVisitors: number
}

export type AnalyticsTopItem = {
  count: number
  label: string
}

export type AnalyticsRecentEvent = {
  id: string
  route: null | string
  sessionId: null | string
  timestamp: number
  type: string
  userId: null | string
}

export type AnalyticsDashboardData = {
  generatedAt: string
  overview: AnalyticsOverview
  recentCurrentPage: number
  recentEvents: AnalyticsRecentEvent[]
  recentLimit: number
  recentTotalDocs: number
  recentTotalPages: number
  topEvents: AnalyticsTopItem[]
  topRoutes: AnalyticsTopItem[]
  trend: AnalyticsDailyPoint[]
}

const formatDay = (value: Date) => value.toISOString().slice(0, 10)

const buildDayRange = (days: number) => {
  const today = new Date()
  const items: string[] = []

  for (let index = days - 1; index >= 0; index -= 1) {
    items.push(formatDay(new Date(today.getTime() - index * DAY_IN_MS)))
  }

  return items
}

const coerceLabel = (value: null | string | undefined, fallback: string) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

const getRequiredDocumentId = (value: AnalyticsRecentEvent['id'] | undefined) => {
  if (!value) {
    throw new Error('Analytics event document is missing _id.')
  }

  return value
}

export const getAnalyticsDashboardData = async ({
  days = 14,
  recentLimit = 12,
  recentPage = 1,
  topLimit = 8,
}: {
  days?: number
  recentLimit?: number
  recentPage?: number
  topLimit?: number
} = {}): Promise<AnalyticsDashboardData> => {
  await ensureAnalyticsSchema()
  const collection = await getAnalyticsCollection()
  const sinceTimestamp = Date.now() - DAY_IN_MS
  const trendSinceTimestamp = Date.now() - (days - 1) * DAY_IN_MS
  const sanitizedRecentLimit = Math.max(1, Math.floor(recentLimit))
  const sanitizedRequestedRecentPage = Math.max(1, Math.floor(recentPage))

  const [overviewRow] = await collection
    .aggregate<OverviewRow>([
      {
        $group: {
          _id: null,
          totalEvents: { $sum: 1 },
          visitorIds: { $addToSet: '$visitor_id' },
          pageViews: {
            $sum: {
              $cond: [{ $in: ['$type', PAGE_VIEW_EVENT_TYPES] }, 1, 0],
            },
          },
          eventsLast24Hours: {
            $sum: {
              $cond: [{ $gte: ['$timestamp', sinceTimestamp] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          eventsLast24Hours: 1,
          pageViews: 1,
          totalEvents: 1,
          uniqueVisitors: {
            $size: {
              $filter: {
                input: '$visitorIds',
                as: 'visitorId',
                cond: {
                  $and: [{ $ne: ['$$visitorId', null] }, { $ne: ['$$visitorId', ''] }],
                },
              },
            },
          },
        },
      },
    ])
    .toArray()

  const trendRows = await collection
    .aggregate<DailyRow>([
      {
        $match: {
          event_day: { $ne: null },
          timestamp: { $gte: trendSinceTimestamp },
        },
      },
      {
        $group: {
          _id: '$event_day',
          total: { $sum: 1 },
          visitorIds: { $addToSet: '$visitor_id' },
          pageViews: {
            $sum: {
              $cond: [{ $in: ['$type', PAGE_VIEW_EVENT_TYPES] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          event_day: '$_id',
          pageViews: 1,
          total: 1,
          uniqueVisitors: {
            $size: {
              $filter: {
                input: '$visitorIds',
                as: 'visitorId',
                cond: {
                  $and: [{ $ne: ['$$visitorId', null] }, { $ne: ['$$visitorId', ''] }],
                },
              },
            },
          },
        },
      },
      {
        $sort: {
          event_day: 1,
        },
      },
    ])
    .toArray()

  const topEventRows = await collection
    .aggregate<TypeRow>([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          count: 1,
          type: '$_id',
        },
      },
      {
        $sort: {
          count: -1,
          type: 1,
        },
      },
      {
        $limit: topLimit,
      },
    ])
    .toArray()

  const topRouteRows = await collection
    .aggregate<RouteRow>([
      {
        $match: {
          type: { $in: PAGE_VIEW_EVENT_TYPES },
        },
      },
      {
        $project: {
          route: {
            $ifNull: ['$route', '$metadata.route'],
          },
        },
      },
      {
        $match: {
          route: { $nin: [null, ''] },
        },
      },
      {
        $group: {
          _id: '$route',
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          count: 1,
          route: '$_id',
        },
      },
      {
        $sort: {
          count: -1,
          route: 1,
        },
      },
      {
        $limit: topLimit,
      },
    ])
    .toArray()

  const recentTotalDocs = await collection.countDocuments({})
  const recentTotalPages =
    recentTotalDocs === 0 ? 0 : Math.ceil(recentTotalDocs / sanitizedRecentLimit)
  const currentRecentPage =
    recentTotalPages === 0
      ? 1
      : Math.min(sanitizedRequestedRecentPage, recentTotalPages)
  const recentSkip =
    recentTotalDocs === 0 ? 0 : (currentRecentPage - 1) * sanitizedRecentLimit

  const recentRows: RecentRow[] = (await collection
    .find(
      {},
      {
        projection: {
          metadata: 1,
          route: 1,
          session_id: 1,
          timestamp: 1,
          type: 1,
          user_id: 1,
        },
      },
    )
    .sort({ timestamp: -1, _id: -1 })
    .skip(recentSkip)
    .limit(sanitizedRecentLimit)
    .toArray()).map((row) => ({
    id: getRequiredDocumentId(row._id?.toHexString()),
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? { route: typeof row.metadata.route === 'string' ? row.metadata.route : null }
        : null,
    route: row.route ?? null,
    sessionId: row.session_id ?? null,
    timestamp: Number(row.timestamp),
    type: row.type,
    userId: row.user_id ?? null,
  }))

  const trendLookup = new Map(
    trendRows.map((row) => [
      coerceLabel(row.event_day, formatDay(new Date())),
      {
        total: Number(row.total ?? 0),
        uniqueVisitors: Number(row.uniqueVisitors ?? 0),
        pageViews: Number(row.pageViews ?? 0),
      },
    ]),
  )

  const trend = buildDayRange(days).map((day) => {
    const row = trendLookup.get(day)

    return {
      day,
      pageViews: row?.pageViews ?? 0,
      total: row?.total ?? 0,
      uniqueVisitors: row?.uniqueVisitors ?? 0,
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    overview: {
      eventsLast24Hours: Number(overviewRow?.eventsLast24Hours ?? 0),
      pageViews: Number(overviewRow?.pageViews ?? 0),
      totalEvents: Number(overviewRow?.totalEvents ?? 0),
      uniqueVisitors: Number(overviewRow?.uniqueVisitors ?? 0),
    },
    recentCurrentPage: currentRecentPage,
    recentEvents: recentRows.map((row) => ({
      id: row.id,
      route: row.route ?? row.metadata?.route ?? null,
      sessionId: row.sessionId ?? null,
      timestamp: Number(row.timestamp),
      type: coerceLabel(row.type, 'unknown'),
      userId: row.userId ?? null,
    })),
    recentLimit: sanitizedRecentLimit,
    recentTotalDocs,
    recentTotalPages,
    topEvents: topEventRows.map((row) => ({
      count: Number(row.count),
      label: coerceLabel(row.type, 'unknown'),
    })),
    topRoutes: topRouteRows.map((row) => ({
      count: Number(row.count),
      label: coerceLabel(row.route, '/'),
    })),
    trend,
  }
}
