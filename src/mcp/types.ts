export const MCP_ENTITIES = [
  'companies', 'products', 'jobs', 'ventures', 'identities', 'posts', 'comments',
  'orders', 'carts', 'users', 'media', 'syndications', 'reports',
  'information-requests', 'notification-subscriptions', 'subscribers',
] as const

export type McpEntity = (typeof MCP_ENTITIES)[number]
export type McpJsonValue = string | number | boolean | null | McpJsonValue[] | { [key: string]: McpJsonValue }
export type McpJsonObject = { [key: string]: McpJsonValue }
export type McpGraphQLResult = { data?: Record<string, McpJsonValue | undefined>; errors?: Array<{ message?: string }> }
