import { handleShareRequest } from './service'

export const dynamic = 'force-dynamic'

export const GET = async (_request: Request): Promise<Response> =>
  Response.json({ error: 'Use POST or the shareRepost GraphQL mutation to publish a repost.' }, {
    status: 405,
    headers: { Allow: 'POST' },
  })

export const POST = handleShareRequest
