import config from '@payload-config'
import { getPayload } from 'payload'

import { refreshCryptoRateCache } from '@/crypto/rates/cache'

const getCronSecret = (): null | string => {
  return process.env.CRON_SECRET || process.env.PAYLOAD_SECRET || null
}

const getIsAuthorizedRequest = (request: Request): boolean => {
  const secret = getCronSecret()
  if (!secret) {
    return false
  }

  return request.headers.get('authorization') === `Bearer ${secret}`
}

export const GET = async (request: Request) => {
  if (!getCronSecret()) {
    return Response.json(
      { error: 'Missing CRON_SECRET or PAYLOAD_SECRET environment variable.' },
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
