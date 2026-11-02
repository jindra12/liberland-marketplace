import { createPoppyConfig } from '@/poppy/config/utils'

export const dynamic = 'force-dynamic'

export const GET = async (): Promise<Response> => {
  const settings = createPoppyConfig()
  return Response.json({
    resource: settings.base,
    authorization_servers: [settings.base],
    scopes_supported: settings.scopes,
    bearer_methods_supported: ['header'],
  }, { headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } })
}
