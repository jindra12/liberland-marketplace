import config from '@payload-config'
import { getPayload } from 'payload'

import { refreshCryptoRateCache } from '@/crypto/rates/cache'
import { getCronSecret, isCronAuthorized } from '@/security/cron/utils'

export const GET = async (request: Request) => {
  if (!getCronSecret()) {
    return Response.json(
      { error: 'Missing CRON_SECRET environment variable.' },
      { status: 500 },
    )
  }

  if (!isCronAuthorized(request)) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const payload = await getPayload({ config })
  await refreshCryptoRateCache({ payload })

  return Response.json({
    refreshedAt: new Date().toISOString(),
    success: true,
  })
}
