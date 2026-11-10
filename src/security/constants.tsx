export const CLIENT_REQUESTS_PER_MINUTE = 120
export const GLOBAL_REQUESTS_PER_MINUTE = 1200
export const CLIENT_RAG_SEARCHES_PER_HOUR = 40
export const GLOBAL_RAG_SEARCHES_PER_HOUR = 400
export const MCP_MAX_REQUEST_BYTES = 256 * 1024
export const MCP_MAX_TOOL_INPUT_ELEMENTS = 2000
export const PUBLIC_FETCH_TIMEOUT_MS = 15_000
export const PUBLIC_FETCH_MAX_BYTES = 2 * 1024 * 1024
export const PUBLIC_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const MARKETPLACE_ACCESS_SCOPE = 'marketplace:access'
export const OAUTH_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  MARKETPLACE_ACCESS_SCOPE,
]
