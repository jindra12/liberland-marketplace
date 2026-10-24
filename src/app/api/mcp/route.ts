import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createBackendMcpServer } from '@/mcp/server'
import { limitBackendRequest } from '@/security/utils'
import { MCP_MAX_REQUEST_BYTES } from '@/security/constants'

export const dynamic = 'force-dynamic'

const handleMcpRequest = async (request: Request): Promise<Response> => {
  const limited = await limitBackendRequest(request)
  if (limited) {
    return limited
  }
  const authorization = request.headers.get('authorization') ?? undefined

  const server = createBackendMcpServer(authorization)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: MCP_MAX_REQUEST_BYTES })
  await server.connect(transport)
  return transport.handleRequest(request)
}

export const GET = handleMcpRequest
export const POST = handleMcpRequest
export const DELETE = handleMcpRequest
