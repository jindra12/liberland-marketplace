import { createPoppyConfig } from '@/poppy/config/utils'
import { OAUTH_SCOPES } from '@/security/constants'

export const dynamic = 'force-dynamic'
export const GET = async () => {
  const settings = createPoppyConfig()
  return Response.json(
    {
      resource: `${settings.base}/api/mcp`,
      authorization_servers: [settings.base],
      scopes_supported: OAUTH_SCOPES,
      bearer_methods_supported: ['header'],
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
