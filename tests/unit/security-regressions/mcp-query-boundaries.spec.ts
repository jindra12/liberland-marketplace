import { describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { Kind, parse } from 'graphql'
import { createBackendMcpServer } from '@/mcp/server'
import { executeGraphQL } from '@/mcp/graphql'

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('@/mcp/graphql', () => ({
  executeGraphQL: vi.fn(async () => ({ Companies: { docs: [] }, Searches: { docs: [] } })),
  getGraphQLArgumentType: vi.fn(async (options: { field: string }) =>
    options.field === 'Searches' ? 'Search_where' : 'Company_where',
  ),
}))

describe('MCP GraphQL query boundaries', () => {
  it.each([
    {
      tool: 'list_entities',
      key: 'id: { equals: "fixture" } }) { docs { id } } Orders { docs { id } } injected: Companies(where: { id',
    },
    {
      tool: 'search_entities',
      key: 'id: { equals: "fixture" } }] }) { docs { title } } Orders { docs { id } } injected: Searches(where: { AND: [{ title',
    },
  ])('does not let filter object keys add GraphQL roots through $tool', async (scenario) => {
    vi.mocked(executeGraphQL).mockClear()
    const server = createBackendMcpServer()
    const client = new Client({ name: 'security-regression', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    try {
      await server.connect(serverTransport)
      await client.connect(clientTransport)
      const result = await client.callTool({
        name: scenario.tool,
        arguments: {
          entity: 'companies',
          query: 'fixture',
          where: { [scenario.key]: { equals: 'fixture' } },
        },
      })
      const query = vi.mocked(executeGraphQL).mock.calls.at(-1)?.[0].query
      if (!query) {
        expect(result.isError).toBe(true)
        return
      }
      const operation = parse(query).definitions.find(
        (definition) => definition.kind === Kind.OPERATION_DEFINITION,
      )
      expect(operation?.selectionSet.selections).toHaveLength(1)
    } finally {
      await client.close()
      await server.close()
    }
  })
})
