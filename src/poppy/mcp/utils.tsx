import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createLocalReq, type Payload } from 'payload'
import {
  ToolResults,
  type ApiCall,
  type CompanyMcp,
} from '@datalayer/personal-agent-protocol/server'
import { createBackendMcpServer } from '@/mcp/server'
import { withMcpAccountRequest } from '@/mcp/graphql'
import { findPoppyAccount } from '../accounts/utils'
import {
  ACCOUNT_READ_TOOLS,
  ACCOUNT_WRITE_TOOLS,
  ENTITY_READ_TOOLS,
  ENTITY_WRITE_TOOLS,
  PUBLIC_MCP_ENTITIES,
  PUBLIC_MCP_TOOLS,
} from '../constants'

export const requiredPoppyScope = (
  name: string,
  args: Readonly<Record<string, unknown>>,
): string | undefined => {
  if (PUBLIC_MCP_TOOLS.has(name)) {
    return undefined
  }
  if (ENTITY_READ_TOOLS.has(name)) {
    return typeof args.entity === 'string' && PUBLIC_MCP_ENTITIES.has(args.entity)
      ? undefined
      : 'account:read'
  }
  if (ACCOUNT_READ_TOOLS.has(name)) {
    return 'account:read'
  }
  if (
    ENTITY_WRITE_TOOLS.has(name) &&
    !(typeof args.entity === 'string' && PUBLIC_MCP_ENTITIES.has(args.entity))
  ) {
    return 'account:write'
  }
  return ACCOUNT_WRITE_TOOLS.has(name) ? 'account:write' : 'marketplace:write'
}

const withBackendClient = async <T,>(run: (client: Client) => Promise<T>): Promise<T> => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const server = createBackendMcpServer()
  const client = new Client({ name: 'nswap-poppy-adapter', version: '1.0.0' })
  try {
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    return await run(client)
  } finally {
    await client.close()
    await server.close()
  }
}

export const createPoppyMcp = async (payload: Payload): Promise<CompanyMcp> => {
  const tools = await withBackendClient(async (client) => (await client.listTools()).tools)
  return {
    description:
      'Existing Nswap MCP tools with explicit consent, Poppy scopes and unchanged Payload account permissions.',
    tools: () =>
      tools.map((tool) =>
        requiredPoppyScope(tool.name, {})?.endsWith(':write')
          ? {
              ...tool,
              inputSchema: {
                ...tool.inputSchema,
                properties: {
                  ...tool.inputSchema.properties,
                  confirmation: { type: 'boolean', const: true },
                },
                required: Array.from(
                  new Set([...(tool.inputSchema.required || []), 'confirmation']),
                ),
              },
            }
          : { ...tool },
      ),
    call: async (name, args, call: ApiCall) => {
      const scope = requiredPoppyScope(name, args)
      if (scope && (!call.accountId || !call.scopes.includes(scope))) {
        return ToolResults.insufficientScope(scope)
      }
      if (scope?.endsWith(':write') && args.confirmation !== true) {
        return {
          isError: true,
          text: 'Obtain explicit user confirmation and send confirmation: true before this change.',
        }
      }
      const execute = async () => {
        const result = await withBackendClient((client) =>
          client.callTool({ name, arguments: { ...args } }),
        )
        return { text: JSON.stringify(result.content), isError: Boolean(result.isError) }
      }
      if (!call.accountId) {
        return execute()
      }
      const user = await findPoppyAccount(payload, call.accountId)
      if (!user) {
        return { isError: true, text: 'This account is not permitted to access the marketplace.' }
      }
      const request = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
      return withMcpAccountRequest(request, execute)
    },
  }
}
