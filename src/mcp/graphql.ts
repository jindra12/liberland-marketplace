import config from '@payload-config'
import { GRAPHQL_POST } from '@payloadcms/next/routes'
import type { McpGraphQLResult, McpJsonObject, McpJsonValue } from './types'

const graphqlPost = GRAPHQL_POST(config)

export const executeGraphQL = async <T = Record<string, McpJsonValue | undefined>>({ authorization, query, variables }: { authorization?: string; query: string; variables?: McpJsonObject }): Promise<T> => {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (authorization) headers.set('Authorization', authorization)

  const response = await graphqlPost(new Request('http://mcp.local/api/graphql', {
    method: 'POST', headers, body: JSON.stringify({ query, variables }),
  }))
  const result = await response.json() as McpGraphQLResult
  if (!response.ok || result.errors?.length) {
    throw new Error(result.errors?.map((error) => error.message).filter(Boolean).join('; ') || 'GraphQL request failed.')
  }
  return (result.data ?? {}) as T
}
