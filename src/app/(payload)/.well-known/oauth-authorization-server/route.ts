import { getOAuthAuthorizationServerMetadata } from '../../api/auth/oauth-metadata'

export const dynamic = 'force-dynamic'

export const GET = async (request: Request): Promise<Response> => {
  return getOAuthAuthorizationServerMetadata(request)
}
