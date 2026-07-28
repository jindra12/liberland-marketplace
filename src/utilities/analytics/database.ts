import type { EventMetadata } from 'locallytics'
import { MongoClient, type Collection, type ObjectId } from 'mongodb'

const ANALYTICS_COLLECTION_NAME = 'locallytics_events'

export type AnalyticsEventDocument = {
  _id?: ObjectId
  event_day: string
  metadata: EventMetadata | null
  route: null | string
  session_id: null | string
  timestamp: number
  type: string
  user_id: null | string
  visitor_id: string
}

let analyticsClientPromise: null | Promise<MongoClient> = null
let analyticsCollectionPromise: null | Promise<Collection<AnalyticsEventDocument>> = null
let analyticsSchemaReady = false
let analyticsSchemaPromise: null | Promise<void> = null

const getDatabaseURL = () => {
  const value = process.env.DATABASE_URL

  if (!value) {
    throw new Error('Missing DATABASE_URL environment variable')
  }

  return value
}

export const getAnalyticsMongoClient = async () => {
  if (!analyticsClientPromise) {
    analyticsClientPromise = new MongoClient(getDatabaseURL())
      .connect()
      .catch((error: unknown) => {
        analyticsClientPromise = null
        throw error
      })
  }

  return analyticsClientPromise
}

export const getAnalyticsCollection = async () => {
  if (!analyticsCollectionPromise) {
    analyticsCollectionPromise = getAnalyticsMongoClient()
      .then((client) => client.db().collection<AnalyticsEventDocument>(ANALYTICS_COLLECTION_NAME))
      .catch((error: unknown) => {
        analyticsCollectionPromise = null
        throw error
      })
  }

  return analyticsCollectionPromise
}

export const ensureAnalyticsSchema = async () => {
  if (analyticsSchemaReady) {
    return
  }

  if (!analyticsSchemaPromise) {
    analyticsSchemaPromise = (async () => {
      const collection = await getAnalyticsCollection()

      await Promise.all([
        collection.createIndex({ timestamp: -1 }, { name: 'idx_locallytics_events_timestamp' }),
        collection.createIndex({ type: 1 }, { name: 'idx_locallytics_events_type' }),
        collection.createIndex({ user_id: 1 }, { name: 'idx_locallytics_events_user_id' }),
        collection.createIndex({ session_id: 1 }, { name: 'idx_locallytics_events_session_id' }),
        collection.createIndex({ visitor_id: 1 }, { name: 'idx_locallytics_events_visitor_id' }),
        collection.createIndex({ event_day: 1 }, { name: 'idx_locallytics_events_event_day' }),
        collection.createIndex({ route: 1 }, { name: 'idx_locallytics_events_route' }),
      ])

      analyticsSchemaReady = true
    })().finally(() => {
      analyticsSchemaPromise = null
    })
  }

  await analyticsSchemaPromise
}
