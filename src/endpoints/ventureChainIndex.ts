import { APIError, type Endpoint } from 'payload'
import { getVentureIndex } from '@/venture/marketService'
import { z } from 'zod'
import { PUBLIC_TEST_RPC_METHODS } from '@/venture/constants'
import { limitBackendRequest } from '@/security/utils'

const publicRpcCall = z
  .object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string().max(100), z.number().int(), z.null()]).optional(),
    method: z.enum(PUBLIC_TEST_RPC_METHODS),
    params: z.array(z.json()).max(20).optional(),
  })
  .strict()
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
      const snapshot = await getVentureIndex(req, id, String(deploymentID))
      return Response.json(snapshot, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      console.error(error)
      return Response.json(
        { error: error instanceof Error ? error.message : 'Venture indexing failed.' },
        { status: error instanceof APIError ? error.status : 400 },
      )
    }
  },
}
