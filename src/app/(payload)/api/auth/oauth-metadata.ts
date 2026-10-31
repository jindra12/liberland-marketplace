import { getPayloadAuthInstance } from './auth-instance'
import { getPoppyService } from '@/poppy/runtime/utils'

export const getOAuthAuthorizationServerMetadata = async (request: Request): Promise<Response> => {
  const payloadAuth = await getPayloadAuthInstance()
  const metadataUrl = new URL('/api/auth/.well-known/openid-configuration', request.url)
  const metadataResponse = await payloadAuth.betterAuth.handler(new Request(metadataUrl, {
    headers: request.headers,
    method: 'GET',
  }))

  if (!metadataResponse.ok) {
    return metadataResponse
  }
  const legacy: Record<string, string | string[] | boolean> = await metadataResponse.json()
  const service = await getPoppyService()
  const protocol = service.oauthMetadata()
  return Response.json({
    ...legacy, ...protocol,
    authorization_endpoint: legacy.authorization_endpoint,
    token_endpoint: legacy.token_endpoint,
    scopes_supported: [...new Set([...(Array.isArray(legacy.scopes_supported) ? legacy.scopes_supported : []), ...service.config.scopes])],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none', 'private_key_jwt'],
    token_endpoint_auth_signing_alg_values_supported: ['ES256', 'PS384'],
    revocation_endpoint_auth_methods_supported: ['private_key_jwt'],
    client_id_metadata_document_supported: true,
  }, { headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } })
}
