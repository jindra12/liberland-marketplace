import config from '@payload-config'
import { createPayloadRequest } from 'payload'

import { searchRag } from '@/ai/rag/service'
import type { RagSearchRequest } from '@/ai/rag/types'

const parseRequest = async (request: Request): Promise<RagSearchRequest> => {
  const body =
    request.method === 'GET'
      ? (() => {
          const params = new URL(request.url).searchParams

          return {
            query: params.get('query') ?? params.get('q') ?? '',
            limit: Number(params.get('limit') ?? '') || undefined,
          }
        })()
      : ((await request.json()) as RagSearchRequest)

  if (typeof body.query !== 'string' || body.query.length > 600) {
    throw new Error('Query must be a string of at most 600 characters.')
  }

  return body
}

const handleSearch = async (request: Request): Promise<Response> => {
  try {
    const req = await createPayloadRequest({
      canSetHeaders: false,
      config,
      request,
    })
    const result = await searchRag(req, await parseRequest(request))

    return Response.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'RAG search failed.'
    const status =
      message.includes('required') || message.includes('at most')
        ? 400
        : message.includes('429') || message.includes('no credits')
          ? 503
          : 500

    return Response.json({ error: message }, { status })
  }
}

export const GET = handleSearch
export const POST = handleSearch
