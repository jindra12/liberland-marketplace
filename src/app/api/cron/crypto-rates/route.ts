import config from '@payload-config'
import { getPayload } from 'payload'

import { refreshCryptoRateCache } from '@/crypto/rates/cache'

const getIsAuthorizedRequest = (request: Request): boolean => {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return false
  }

  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return Response.json(
      { error: 'Missing CRON_SECRET environment variable.' },
      { status: 500 },
    )
  }

  if (!getIsAuthorizedRequest(request)) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const payload = await getPayload({ config })
  await refreshCryptoRateCache({ payload })

  return Response.json({
    refreshedAt: new Date().toISOString(),
    success: true,
  })
}
