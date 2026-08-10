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

const runAiRepostJob = async (trigger: 'admin' | 'cron'): Promise<Response> => {
  const startedAt = Date.now()

  console.info('[ai-reposts] run started', { trigger })

  try {
    const runner = await loadAiRepostRunner()

    if (!runner) {
      const result = {
        created: 0,
        companiesScanned: 0,
        skipped: true,
        skippedReason: 'missing-chatgpt-key',
      } as const

      console.info('[ai-reposts] run skipped', { ...result, durationMs: Date.now() - startedAt, trigger })

      return Response.json(result)
    }

    const payload = await getPayload({ config })
    const result = await runner.runAiRepostCycle({ payload })

    console.info('[ai-reposts] run completed', {
      ...result,
      durationMs: Date.now() - startedAt,
      trigger,
    })

    return Response.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    console.error('[ai-reposts] run failed', {
      durationMs: Date.now() - startedAt,
      error: message,
      trigger,
    })

    return Response.json(
      { error: `AI repost run failed: ${message}` },
      { status: 500 },
    )
  }
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

  return runAiRepostJob('cron')
}

export const POST = async (request: Request): Promise<Response> => {
  if (!(await isAdminAuthorized(request))) {
    return Response.json({ error: 'Admin access required.' }, { status: 403 })
  }

  return runAiRepostJob('admin')
}
