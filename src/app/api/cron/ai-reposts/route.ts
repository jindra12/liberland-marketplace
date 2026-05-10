import config from '@payload-config'
import { getPayload } from 'payload'

import { loadAiRepostRunner } from '@/ai/reposts'

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

const isAdminAuthorized = async (request: Request): Promise<boolean> => {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })

  return Boolean(auth.user?.role?.includes('admin'))
}

const runAiRepostJob = async (): Promise<Response> => {
  const runner = await loadAiRepostRunner()

  if (!runner) {
    return Response.json({
      created: 0,
      companiesScanned: 0,
      skipped: true,
      skippedReason: 'missing-chatgpt-key',
    })
  }

  const payload = await getPayload({ config })
  const result = await runner.runAiRepostCycle({ payload })

  return Response.json(result)
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

  return runAiRepostJob()
}

export const POST = async (request: Request): Promise<Response> => {
  if (!(await isAdminAuthorized(request))) {
    return Response.json({ error: 'Admin access required.' }, { status: 403 })
  }

  return runAiRepostJob()
}
