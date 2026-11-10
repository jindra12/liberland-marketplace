import type { Endpoint } from 'payload'
import type { VentureIndexContext, VentureIndexSnapshot } from '@/venture/types'
import { LRUCache } from 'lru-cache'
import { z } from 'zod'
import { PUBLIC_TEST_RPC_METHODS, VENTURE_INDEX_CACHE_TTL_MS, VENTURE_INDEX_CACHE_MAX_BYTES } from '@/venture/constants'
import { limitBackendRequest } from '@/security/utils'

const snapshots = new LRUCache<string, VentureIndexSnapshot, VentureIndexContext>({
  max: 128,
  maxSize: VENTURE_INDEX_CACHE_MAX_BYTES,
  ttl: VENTURE_INDEX_CACHE_TTL_MS,
  sizeCalculation: (snapshot) => Buffer.byteLength(JSON.stringify(snapshot)),
  fetchMethod: async (_key, _previous, options) => {
    const { syncVentureIndex } = await import('@/venture/indexUtils')
    return syncVentureIndex(options.context.req, options.context.ventureID, options.context.deployment)
  },
})
const publicRpcCall = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string().max(100), z.number().int(), z.null()]).optional(),
  method: z.enum(PUBLIC_TEST_RPC_METHODS),
  params: z.array(z.json()).max(20).optional(),
}).strict()
const publicRpcRequest = z.union([publicRpcCall, z.array(publicRpcCall).min(1).max(20)])

// Disposable public test RPC, with a fixed target that cannot proxy other services.
export const ventureTestRpcEndpoint: Endpoint = {
  path: '/venture-test-rpc',
  method: 'post',
  handler: async (req) => {
    try {
      const body = publicRpcRequest.safeParse(await req.json!())
      if (!body.success) {
        return Response.json({ error: 'Unsupported public test RPC request.' }, { status: 400 })
      }
      const result = await fetch('http://127.0.0.1:8545', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body.data),
        signal: AbortSignal.timeout(15_000),
      })
      return new Response(await result.text(), {
        status: result.status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      })
    } catch (error) {
      console.error(error)
      return Response.json({ error: 'The hosted test fork is not running.' }, { status: 503 })
    }
  },
}

export const ventureChainIndexEndpoint: Endpoint = {
  path: '/:id/contract-index',
  method: 'get',
  handler: async (req) => {
    try {
      const limited = await limitBackendRequest(req)
      if (limited) {
        return limited
      }
      const id = String(req.routeParams?.id || '')
      const deploymentID = req.query.deploymentId
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
        return Response.json({ error: 'Deployment not found.' }, { status: 404 })
      }
      const key = JSON.stringify([id, venture.updatedAt, deployment])
      const snapshot = await snapshots.fetch(key, { context: { req, ventureID: id, deployment } })
      if (!snapshot) {
        return Response.json({ error: 'Venture indexing was interrupted. Please retry.' }, { status: 503 })
      }
      // Backfill pages must continue advancing; only caught-up snapshots receive the full TTL.
      if (snapshot.hasMore && snapshots.peek(key) === snapshot) {
        snapshots.delete(key)
      }
      return Response.json(snapshot, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      console.error(error)
      return Response.json(
        { error: error instanceof Error ? error.message : 'Venture indexing failed.' },
        { status: 400 },
      )
    }
  },
}
