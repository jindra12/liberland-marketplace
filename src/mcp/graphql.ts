import config from '@payload-config'
import { GRAPHQL_POST } from '@payloadcms/next/routes'
import type { McpGraphQLResult, McpJsonObject, McpJsonValue } from './types'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { PayloadRequest, SanitizedConfig } from 'payload'
import { configToSchema } from '@payloadcms/graphql'
import { createHandler } from 'graphql-http/lib/use/fetch'
import { getServerSideURL } from '@/utilities/getURL'

const graphqlPost = GRAPHQL_POST(config)
const accountRequests = new AsyncLocalStorage<PayloadRequest>()
const schemas = new WeakMap<SanitizedConfig, ReturnType<typeof configToSchema>>()

const getSchema = (resolvedConfig: SanitizedConfig) => {
  const existing = schemas.get(resolvedConfig)
  if (existing) {
    return existing
  }
  const compiled = configToSchema(resolvedConfig)
  schemas.set(resolvedConfig, compiled)
  return compiled
}

export const getGraphQLArgumentType = async (options: {
  operation: 'query' | 'mutation'
  field: string
  argument: string
}): Promise<string> => {
  const { schema } = getSchema(await config)
  const operation = options.operation === 'query' ? schema.getQueryType() : schema.getMutationType()
  const input = operation
    ?.getFields()
    [options.field]?.args.find((argument) => argument.name === options.argument)
  if (!input) {
    throw new Error(`The backend does not expose ${options.field}(${options.argument}).`)
  }
  return input.type.toString()
}

export const withMcpAccountRequest = <T>(
  request: PayloadRequest,
  run: () => Promise<T>,
): Promise<T> => accountRequests.run(request, run)

export const executeGraphQL = async <T = Record<string, McpJsonValue | undefined>>({
  authorization,
  query,
  variables,
}: {
  authorization?: string
  query: string
  variables?: McpJsonObject
}): Promise<T> => {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (authorization) headers.set('Authorization', authorization)

  const request = new Request(new URL('/api/graphql', getServerSideURL()), {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const accountRequest = accountRequests.getStore()
  // Only the verified Poppy adapter supplies this process-local request. Native
  // Payload GraphQL resolvers retain their access checks; no bypass token is minted.
  const response = accountRequest
    ? await executeAccountGraphQL(request, accountRequest)
    : await graphqlPost(request)
  const result = (await response.json()) as McpGraphQLResult
  if (!response.ok || result.errors?.length) {
    throw new Error(
      result.errors
        ?.map((error) => error.message)
        .filter(Boolean)
        .join('; ') || 'GraphQL request failed.',
    )
  }
  return (result.data ?? {}) as T
}

const executeAccountGraphQL = async (request: Request, req: PayloadRequest): Promise<Response> => {
  const compiled = getSchema(req.payload.config)
  return createHandler({
    schema: compiled.schema,
    context: { req, headers: {} },
    validationRules: (_, args, rules) => rules.concat(compiled.validationRules(args)),
  })(request)
}
