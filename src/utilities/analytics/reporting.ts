import type { Payload } from 'payload'
import { ensureAnalyticsSchema, getAnalyticsCollection } from './database'

const CREATE_ORDER_OPERATION_NAME = 'CreateOrder'
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

type TopLabelRow = {
  count: number
  label: string
}

type TopPurchasedProductRow = {
  count: number
  productID: null | string
  variantID: null | string
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
  topMutations: AnalyticsTopItem[]
  topProducts: AnalyticsTopItem[]
  topQueries: AnalyticsTopItem[]
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

const getRequiredDocumentId = (value: AnalyticsRecentEvent['id'] | undefined) => {
  if (!value) {
    throw new Error('Analytics event document is missing _id.')
  }

  return value
}

const buildTopGraphQLOperationPipeline = ({
  operationType,
  topLimit,
}: {
  operationType: 'mutation' | 'query'
  topLimit: number
}) => [
  {
    $match: {
      'metadata.operationType': operationType,
    },
  },
  {
    $group: {
      _id: {
        $ifNull: ['$metadata.operationName', `anonymous ${operationType}`],
      },
      count: { $sum: 1 },
    },
  },
  {
    $project: {
      _id: 0,
      count: 1,
      label: '$_id',
    },
  },
  {
    $sort: {
      count: -1,
      label: 1,
    },
  },
  {
    $limit: topLimit,
  },
]

const resolveTopProducts = async ({
  payload,
  rows,
  topLimit,
}: {
  payload: Payload
  rows: TopPurchasedProductRow[]
  topLimit: number
}): Promise<AnalyticsTopItem[]> => {
  const directProductIDs = rows
    .map((row) => row.productID)
    .filter((value): value is string => Boolean(value))
  const variantIDs = rows
    .map((row) => row.variantID)
    .filter((value): value is string => Boolean(value))

  const variantDocs =
    variantIDs.length === 0
      ? []
      : (
          await payload.find({
            collection: 'variants',
            depth: 0,
            limit: variantIDs.length,
            pagination: false,
            where: {
              id: {
                in: variantIDs,
              },
            },
          })
        ).docs
  const variantProductMap = new Map(
    variantDocs.map((variant) => [
      variant.id,
      typeof variant.product === 'string' ? variant.product : variant.product.id,
    ]),
  )
  const allProductIDs = new Set(directProductIDs)

  rows.forEach((row) => {
    if (!row.productID && row.variantID) {
      const productID = variantProductMap.get(row.variantID)

      if (productID) {
        allProductIDs.add(productID)
      }
    }
  })

  const productDocs =
    allProductIDs.size === 0
      ? []
      : (
          await payload.find({
            collection: 'products',
            depth: 0,
            limit: allProductIDs.size,
            pagination: false,
            where: {
              id: {
                in: [...allProductIDs],
              },
            },
          })
        ).docs
  const productLabelMap = new Map(productDocs.map((product) => [product.id, product.name]))
  const countsByProductID = new Map<string, number>()

  rows.forEach((row) => {
    const productID =
      row.productID ?? (row.variantID ? variantProductMap.get(row.variantID) ?? null : null)

    if (!productID) {
      return
    }

    countsByProductID.set(productID, (countsByProductID.get(productID) ?? 0) + Number(row.count))
  })

  return [...countsByProductID.entries()]
    .map(([productID, count]) => ({
      count,
      label: productLabelMap.get(productID) ?? productID,
    }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count
      }

      return left.label.localeCompare(right.label)
    })
    .slice(0, topLimit)
}

export const getAnalyticsDashboardData = async ({
  days = 14,
  payload,
  recentLimit = 12,
  recentPage = 1,
  topLimit = 8,
}: {
  days?: number
  payload: Payload
  recentLimit?: number
  recentPage?: number
  topLimit?: number
}): Promise<AnalyticsDashboardData> => {
  await ensureAnalyticsSchema()
  const collection = await getAnalyticsCollection()
  const sinceTimestamp = Date.now() - DAY_IN_MS
  const trendSinceTimestamp = Date.now() - (days - 1) * DAY_IN_MS
  const sanitizedRecentLimit = Math.max(1, Math.floor(recentLimit))
  const sanitizedRequestedRecentPage = Math.max(1, Math.floor(recentPage))

  const [
    [overviewRow],
    trendRows,
    topEventRows,
    topRouteRows,
    topQueryRows,
    topMutationRows,
    topPurchasedProductRows,
    recentTotalDocs,
  ] = await Promise.all([
    collection
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
      .toArray(),
    collection
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
      .toArray(),
    collection
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
      .toArray(),
    collection
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
      .toArray(),
    collection
      .aggregate<TopLabelRow>(buildTopGraphQLOperationPipeline({ operationType: 'query', topLimit }))
      .toArray(),
    collection
      .aggregate<TopLabelRow>(
        buildTopGraphQLOperationPipeline({ operationType: 'mutation', topLimit }),
      )
      .toArray(),
    collection
      .aggregate<TopPurchasedProductRow>([
        {
          $match: {
            'metadata.operationName': CREATE_ORDER_OPERATION_NAME,
            'metadata.operationType': 'mutation',
          },
        },
        {
          $project: {
            items: '$metadata.variables.data.items',
          },
        },
        {
          $unwind: '$items',
        },
        {
          $project: {
            _id: 0,
            count: {
              $ifNull: ['$items.quantity', 0],
            },
            productID: '$items.product',
            variantID: '$items.variant',
          },
        },
        {
          $match: {
            $or: [{ productID: { $ne: null } }, { variantID: { $ne: null } }],
          },
        },
      ])
      .toArray(),
    collection.countDocuments({}),
  ])
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
      row.event_day,
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
  const topProducts = await resolveTopProducts({
    payload,
    rows: topPurchasedProductRows,
    topLimit,
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
      type: row.type || 'unknown',
      userId: row.userId ?? null,
    })),
    recentLimit: sanitizedRecentLimit,
    recentTotalDocs,
    recentTotalPages,
    topEvents: topEventRows.map((row) => ({
      count: Number(row.count),
      label: row.type || 'unknown',
    })),
    topMutations: topMutationRows.map((row) => ({
      count: Number(row.count),
      label: row.label || 'anonymous mutation',
    })),
    topProducts,
    topQueries: topQueryRows.map((row) => ({
      count: Number(row.count),
      label: row.label || 'anonymous query',
    })),
    topRoutes: topRouteRows.map((row) => ({
      count: Number(row.count),
      label: row.route || '/',
    })),
    trend,
  }
}
