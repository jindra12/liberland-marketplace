import { APIError, type Endpoint } from 'payload'
import { authorizeVentureRecovery, recoveryRecordSchema } from '@/venture/recoveryUtils'

export const ventureDeploymentRecoveryEndpoints: Endpoint[] = (
  ['get', 'put', 'delete'] as const
).map((method) => ({
  path: '/:id/deployment-recovery',
  method,
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: 'Authentication required.' }, { status: 401 })
    }
    try {
      const key = await authorizeVentureRecovery(req)
      const existing = (
        await req.payload.find({
          collection: 'venture-deployment-recoveries',
          where: { key: { equals: key } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
          req,
        })
      ).docs[0]
      switch (method) {
        case 'get':
          return Response.json(
            { record: existing?.record || null },
            { headers: { 'Cache-Control': 'no-store' } },
          )
        case 'delete':
          if (existing) {
            await req.payload.delete({
              collection: 'venture-deployment-recoveries',
              id: existing.id,
              overrideAccess: true,
              req,
            })
          }
          return Response.json({ record: null })
        default: {
          const record = recoveryRecordSchema.parse(await req.json!())
          if (existing) {
            await req.payload.update({
              collection: 'venture-deployment-recoveries',
              id: existing.id,
              data: { record },
              overrideAccess: true,
              req,
            })
          } else {
            await req.payload.create({
              collection: 'venture-deployment-recoveries',
              data: { key, record },
              overrideAccess: true,
              req,
            })
          }
          return Response.json({ record })
        }
      }
    } catch (error) {
      console.error(error)
      return Response.json(
        { error: error instanceof Error ? error.message : 'Deployment recovery failed.' },
        { status: error instanceof APIError ? error.status : 400 },
      )
    }
  },
}))
