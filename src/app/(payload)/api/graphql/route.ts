/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
/* DO NOT MODIFY IT BECAUSE IT COULD BE REWRITTEN AT ANY TIME. */
import config from '@payload-config'
import { GRAPHQL_POST } from '@payloadcms/next/routes'

export const dynamic = 'force-dynamic'

const graphqlPost = GRAPHQL_POST(config)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, Apollo-Require-Preflight, X-Apollo-Operation-Name',
}

export const POST = async (request: Request): Promise<Response> => {
  const response = await graphqlPost(request)

  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value)
  })

  return response
}

export const OPTIONS = async (): Promise<Response> => {
  return new Response(null, {
    headers: corsHeaders,
    status: 204,
  })
}
