import config from '@payload-config'
import { createPayloadRequest, getPayload } from 'payload'

import { reindexSearch } from '@/search/reindex'

const getCronSecret = (): null | string => {
  return process.env.CRON_SECRET || process.env.PAYLOAD_SECRET || null
}

const isCronAuthorized = (request: Request): boolean => {
  const secret = getCronSecret()

  if (!secret) {
    return false
  }

  return request.headers.get('authorization') === `Bearer ${secret}`
}

const runReindexSearchJob = async (request: Request): Promise<Response> => {
  const resolvedConfig = await config
  const payload = await getPayload({ config: resolvedConfig })
  const req = await createPayloadRequest({
    canSetHeaders: false,
    config: resolvedConfig,
    request,
  })

  const service = {
    payload: {
      create: (args: Parameters<typeof req.payload.create>[0]) =>
        req.payload.create({ ...args, req }),
      deleteMany: (args: Parameters<typeof req.payload.db.deleteMany>[0]) =>
        req.payload.db.deleteMany({ ...args }),
      find: (args: Parameters<typeof req.payload.find>[0]) => req.payload.find({ ...args, req }),
      findByID: (args: Parameters<typeof req.payload.findByID>[0]) =>
        req.payload.findByID({ ...args, req }),
      logger: payload.logger,
    },
  }

  const counts = await reindexSearch(service)

  return Response.json({
    collections: counts,
    success: true,
  })
}

export const GET = async (request: Request): Promise<Response> => {
  if (!getCronSecret()) {
    return Response.json(
      { error: 'Missing CRON_SECRET or PAYLOAD_SECRET environment variable.' },
      { status: 500 },
    )
  }

  if (!isCronAuthorized(request)) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  return runReindexSearchJob(request)
}
