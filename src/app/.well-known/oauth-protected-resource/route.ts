import { getServerSideURL } from '../../../utilities/getURL'

export const dynamic = 'force-dynamic'

export const GET = async (): Promise<Response> => {
  const resource = new URL('/api/mcp', getServerSideURL()).toString()
  const authorizationServer = new URL('/api/auth', getServerSideURL()).toString()

  return Response.json({
    resource,
    authorization_servers: [authorizationServer],
    scopes_supported: ['openid', 'profile', 'email'],
    bearer_methods_supported: ['header'],
  })
}
