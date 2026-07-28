import {
  createLocallytics,
  type DatabaseAdapter,
  type EventMetadata,
  type LocallyticsEvent,
  type LocallyticsEventInput,
} from 'locallytics'
import type { Filter } from 'mongodb'
import {
  ensureAnalyticsSchema,
  getAnalyticsCollection,
  type AnalyticsEventDocument,
} from './database'

type AnalyticsTrackEventInput = {
  authenticatedUserId?: string
  distinctId?: string
  metadata?: EventMetadata
  requestIp?: string
  sessionId?: string
  type: string
}

type StoredEventDocument = Omit<AnalyticsEventDocument, '_id'>

let analyticsAdapter: DatabaseAdapter | null = null

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toEventDay = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10)

const getMetadataRoute = (metadata: EventMetadata | undefined) => {
  const candidate = metadata?.route

  if (typeof candidate !== 'string') {
    return null
  }

  return candidate || null
}

const getMetadataSessionId = (metadata: EventMetadata | undefined) => {
  const candidate = metadata?.sessionId

  if (typeof candidate !== 'string') {
    return undefined
  }

  return candidate || undefined
}

const getMetadataRequestIp = (metadata: EventMetadata | undefined) => {
  const candidate = metadata?.requestIp

  if (typeof candidate !== 'string') {
    return undefined
  }

  return candidate || undefined
}

const getVisitorId = ({
  requestIp,
  userId,
}: {
  requestIp: null | string
  userId: null | string
}) => userId ?? requestIp ?? `anon_${crypto.randomUUID()}`

const getRequiredDocumentId = (document: AnalyticsEventDocument) => {
  if (!document._id) {
    throw new Error('Analytics event document is missing _id.')
  }

  return document._id
}

const toStoredEvent = (event: LocallyticsEventInput): StoredEventDocument => {
  const metadata = isRecord(event.metadata) ? event.metadata : undefined
  const sessionId = getMetadataSessionId(metadata) ?? event.sessionId ?? null
  const requestIp = getMetadataRequestIp(metadata) ?? null
  const userId = event.userId ?? null
  const timestamp = Number(event.timestamp)

  return {
    event_day: toEventDay(timestamp),
    metadata: metadata ?? null,
    route: getMetadataRoute(metadata),
    session_id: sessionId,
    timestamp,
    type: event.type,
    user_id: userId,
    visitor_id: getVisitorId({ requestIp, userId }),
  }
}

const normalizeEventDocument = (document: AnalyticsEventDocument): LocallyticsEvent => ({
  id: getRequiredDocumentId(document).toHexString(),
  metadata: document.metadata ?? undefined,
  sessionId: document.session_id ?? undefined,
  timestamp: Number(document.timestamp),
  type: document.type,
  userId: document.user_id ?? undefined,
})

const getAnalyticsAdapter = () => {
  if (analyticsAdapter) {
    return analyticsAdapter
  }

  let initialized = false

  const initialize = async () => {
    if (initialized) {
      return
    }

    await ensureAnalyticsSchema()
    initialized = true
  }

  analyticsAdapter = {
    initialize,
    async insertEvent(event: LocallyticsEventInput) {
      await initialize()
      const collection = await getAnalyticsCollection()
      const storedEvent = toStoredEvent(event)
      const insertResult = await collection.insertOne(storedEvent)
      const inserted = await collection.findOne({ _id: insertResult.insertedId })

      return inserted
        ? normalizeEventDocument(inserted)
        : {
            id: insertResult.insertedId.toHexString(),
            metadata: storedEvent.metadata ?? undefined,
            sessionId: storedEvent.session_id ?? undefined,
            timestamp: storedEvent.timestamp,
            type: storedEvent.type,
            userId: storedEvent.user_id ?? undefined,
          }
    },
    async listEvents(options) {
      await initialize()
      const collection = await getAnalyticsCollection()
      const filter: Filter<AnalyticsEventDocument> = options?.type ? { type: options.type } : {}
      const limit = options?.limit ? Math.max(1, Math.floor(options.limit)) : undefined
      let cursor = collection.find(filter).sort({ timestamp: -1, _id: -1 })

      if (limit) {
        cursor = cursor.limit(limit)
      }

      const rows = await cursor.toArray()
      return rows.map((row) => normalizeEventDocument(row))
    },
  }

  return analyticsAdapter
}

export const trackAnalyticsEvent = async ({
  authenticatedUserId,
  distinctId,
  metadata,
  requestIp,
  sessionId,
  type,
}: AnalyticsTrackEventInput) => {
  const tracker = createLocallytics({
    database: getAnalyticsAdapter(),
    sessionTracking: false,
    userId: authenticatedUserId,
  })

  return tracker.track(type, {
    ...(distinctId ? { distinctId } : {}),
    ...metadata,
    ...(requestIp ? { requestIp } : {}),
    ...(sessionId ? { sessionId } : {}),
  })
}
