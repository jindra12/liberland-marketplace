import { createPoppyConfig } from '@/poppy/config/utils'

export const dynamic = 'force-dynamic'
export const GET = async () => {
  const settings = createPoppyConfig()
  return Response.json({ resource: `${settings.base}/api/mcp`, authorization_servers: [settings.base], scopes_supported: ['openid', 'profile', 'email', 'offline_access'], bearer_methods_supported: ['header'] }, { headers: { 'Cache-Control': 'no-store' } })
}
