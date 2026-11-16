import { APIError, type PayloadRequest } from 'payload'
import { LRUCache } from 'lru-cache'
import type { VentureIndexContext, VentureIndexSnapshot } from './types'
import { VENTURE_INDEX_CACHE_TTL_MS, VENTURE_INDEX_CACHE_MAX_BYTES } from './constants'

const snapshots = new LRUCache<string, VentureIndexSnapshot, VentureIndexContext>({
  max: 128,
  maxSize: VENTURE_INDEX_CACHE_MAX_BYTES,
  ttl: VENTURE_INDEX_CACHE_TTL_MS,
  sizeCalculation: (snapshot) => Buffer.byteLength(JSON.stringify(snapshot)),
  fetchMethod: async (_key, _previous, options) => {
    const { syncVentureIndex } = await import('./indexUtils')
    return syncVentureIndex(
      options.context.req,
      options.context.ventureID,
      options.context.deployment,
    )
  },
})

export const getVentureIndex = async (req: PayloadRequest, id: string, deploymentID: string) => {
  const venture = await req.payload.findByID({
    collection: 'startups',
    id,
    depth: 0,
    overrideAccess: false,
    user: req.user,
    req,
  })
  const deployment = venture.contractDeployments?.find((entry) => entry.id === deploymentID)
  if (!deployment) {
    throw new APIError('Deployment not found.', 404)
  }
  const key = JSON.stringify([id, venture.updatedAt, deployment])
  const snapshot = await snapshots.fetch(key, { context: { req, ventureID: id, deployment } })
  if (!snapshot) {
    throw new APIError('Venture indexing was interrupted. Please retry.', 503)
  }
  // Backfill pages must continue advancing; only caught-up snapshots receive the full TTL.
  if (snapshot.hasMore && snapshots.peek(key) === snapshot) {
    snapshots.delete(key)
  }
  return snapshot
}
