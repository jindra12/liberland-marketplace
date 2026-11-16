import { APIError, type Endpoint } from 'payload'
import { accessVentureRecovery } from '@/venture/recoveryService'

export const ventureDeploymentRecoveryEndpoints: Endpoint[] = (
  ['get', 'put', 'post', 'delete'] as const
).map((method) => ({
  path: '/:id/deployment-recovery',
  method,
  handler: async (req) => {
    try {
      const record = await accessVentureRecovery(
        req,
        String(req.routeParams?.id),
        String(req.query.walletAddress),
        method,
        method === 'post' || method === 'put' ? await req.json!() : undefined,
      )
      return Response.json({ record }, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      console.error(error)
      return Response.json(
        { error: error instanceof Error ? error.message : 'Deployment recovery failed.' },
        { status: error instanceof APIError ? error.status : 400 },
      )
    }
  },
}))
