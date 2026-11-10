import config from '@payload-config'
import { APIError, createPayloadRequest } from 'payload'

import { createSearchReindexService, reindexSearch } from '@/search/reindex'
import { getCronSecret, isCronAuthorized } from '@/security/cron/utils'

const runReindexSearchJob = async (request: Request): Promise<Response> => {
  const resolvedConfig = await config
  const req = await createPayloadRequest({
    canSetHeaders: false,
    config: resolvedConfig,
    request,
  })

  const counts = await reindexSearch(createSearchReindexService(req))

  return Response.json({
    collections: counts,
    success: true,
  })
}

export const GET = async (request: Request): Promise<Response> => {
  if (!getCronSecret()) {
    return Response.json({ error: 'Missing CRON_SECRET environment variable.' }, { status: 500 })
  }

  if (!isCronAuthorized(request)) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  try {
    return await runReindexSearchJob(request)
  } catch (error) {
    console.error(error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Search rebuild failed.' },
      {
        status: error instanceof APIError ? error.status : 500,
      },
    )
  }
}
