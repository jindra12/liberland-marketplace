import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createBackendMcpServer } from '@/mcp/server'

export const dynamic = 'force-dynamic'

const handleMcpRequest = async (request: Request): Promise<Response> => {
  const authorization = request.headers.get('authorization') ?? undefined

  const server = createBackendMcpServer(authorization)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  return transport.handleRequest(request)
}

export const GET = handleMcpRequest
export const POST = handleMcpRequest
export const DELETE = handleMcpRequest
