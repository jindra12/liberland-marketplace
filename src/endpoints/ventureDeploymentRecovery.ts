import { APIError, type Endpoint } from 'payload'
import {
  authorizeVentureRecovery,
  mergeRecoveryRecord,
  recoveryRecordSchema,
  recoveryActionSchema,
  assertRecoverySnapshot,
  updateRecoveryDocument,
  archivedRecoveryKey,
} from '@/venture/recoveryUtils'

export const ventureDeploymentRecoveryEndpoints: Endpoint[] = (
  ['get', 'put', 'post', 'delete'] as const
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
            const record = recoveryRecordSchema.parse(existing.record)
            if (!record.saved) {
              throw new APIError(
                'An unfinished deployment must be explicitly reconciled and archived, not deleted.',
                409,
              )
            }
            await updateRecoveryDocument(req, existing, {
              key: archivedRecoveryKey(key, record.runnerId || existing.id),
            })
          }
          return Response.json({ record: null })
        case 'post': {
          if (!existing) {
            throw new APIError('Deployment recovery no longer exists.', 404)
          }
          const action = recoveryActionSchema.parse(await req.json!())
          assertRecoverySnapshot(existing, action.record)
          if (action.action === 'abandon') {
            await updateRecoveryDocument(req, existing, {
              key: archivedRecoveryKey(key, action.record.runnerId || existing.id),
            })
            return Response.json({ record: null })
          }
          const record = { ...action.record, runnerId: action.runnerId }
          await updateRecoveryDocument(req, existing, { record })
          return Response.json({ record })
        }
        default: {
          const incoming = recoveryRecordSchema.parse(await req.json!())
          if (!incoming.runnerId) {
            throw new APIError('A deployment runner identifier is required.', 400)
          }
          const archived = await req.payload.find({
            collection: 'venture-deployment-recoveries',
            where: { key: { equals: archivedRecoveryKey(key, incoming.runnerId) } },
            limit: 1,
            depth: 0,
            overrideAccess: true,
            req,
          })
          if (archived.docs.length) {
            throw new APIError('This deployment runner was archived and cannot resume.', 409)
          }
          const record = existing
            ? mergeRecoveryRecord(recoveryRecordSchema.parse(existing.record), incoming)
            : incoming
          if (existing) {
            await updateRecoveryDocument(req, existing, { record })
          } else {
            try {
              await req.payload.create({
                collection: 'venture-deployment-recoveries',
                data: { key, record },
                overrideAccess: true,
                req,
              })
            } catch (error) {
              const competing = await req.payload.find({
                collection: 'venture-deployment-recoveries',
                where: { key: { equals: key } },
                limit: 1,
                depth: 0,
                overrideAccess: true,
                req,
              })
              if (competing.docs.length) {
                throw new APIError(
                  'Another deployment runner claimed this journal. Reload recovery before continuing.',
                  409,
                )
              }
              throw error
            }
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
