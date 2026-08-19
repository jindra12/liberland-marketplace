import { getPayloadAuthInstance } from './auth-instance'

export const getOAuthAuthorizationServerMetadata = async (request: Request): Promise<Response> => {
  const payloadAuth = await getPayloadAuthInstance()
  const metadataUrl = new URL('/api/auth/.well-known/openid-configuration', request.url)
  const metadataResponse = await payloadAuth.betterAuth.handler(new Request(metadataUrl, {
    headers: request.headers,
    method: 'GET',
  }))

  return new Response(metadataResponse.body, {
    status: metadataResponse.status,
    statusText: metadataResponse.statusText,
    headers: metadataResponse.headers,
  })
}
