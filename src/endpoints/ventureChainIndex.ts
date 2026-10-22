import type { Endpoint } from 'payload'
import type { VentureIndexSnapshot } from '@/venture/types'

const syncing = new Map<string, Promise<VentureIndexSnapshot>>()

// Disposable public test RPC, with a fixed target that cannot proxy other services.
export const ventureTestRpcEndpoint: Endpoint = {
  path: '/venture-test-rpc',
  method: 'post',
  handler: async (req) => {
    try {
      const result = await fetch('http://127.0.0.1:8545', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(await req.json!()),
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
      const key = `${id}:${deployment.id}`
      let pending = syncing.get(key)
      if (!pending) {
        const { syncVentureIndex } = await import('@/venture/indexUtils')
        pending = syncVentureIndex(req, id, deployment)
        syncing.set(key, pending)
      }
      try {
        return Response.json(await pending, { headers: { 'Cache-Control': 'no-store' } })
      } finally {
        syncing.delete(key)
      }
    } catch (error) {
      console.error(error)
      return Response.json(
        { error: error instanceof Error ? error.message : 'Venture indexing failed.' },
        { status: 400 },
      )
    }
  },
}
