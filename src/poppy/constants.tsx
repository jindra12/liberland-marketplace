export const POPPY_SCOPE_DESCRIPTIONS = {
  'marketplace:read': 'Read public marketplace records and discover their schemas.',
  'marketplace:write':
    'Create, edit or delete marketplace content within your existing account permissions.',
  'account:read': 'Read your private orders, saved addresses and payment-wallet capabilities.',
  'account:write':
    'Change your carts, saved addresses and seller fulfillment within your existing permissions.',
}
export const POPPY_WRITE_SCOPES = ['marketplace:write', 'account:write']
export const POPPY_COLLECTION = 'poppy_protocol_state'
export const POPPY_MAX_REQUEST_BYTES = 64 * 1024
export const PUBLIC_MCP_ENTITIES = new Set([
  'companies',
  'products',
  'jobs',
  'ventures',
  'identities',
  'posts',
  'comments',
  'media',
  'syndications',
])
export const PUBLIC_MCP_TOOLS = new Set([
  'describe_backend',
  'describe_entity_schema',
  'list_syndicated_servers',
])
export const ENTITY_READ_TOOLS = new Set([
  'list_entities',
  'search_entities',
  'get_entity',
  'find_related_entities',
])
export const ENTITY_WRITE_TOOLS = new Set(['create_entity', 'update_entity', 'delete_entity'])
export const ACCOUNT_READ_TOOLS = new Set([
  'cart_get',
  'wallet_capabilities',
  'list_shipping_addresses',
  'list_seller_orders',
  'prepare_payment',
])
export const ACCOUNT_WRITE_TOOLS = new Set([
  'cart_add_item',
  'cart_set_item_quantity',
  'cart_remove_item',
  'cart_clear',
  'save_shipping_address',
  'update_shipping_address',
  'delete_shipping_address',
  'mark_seller_order_item_fulfilled',
  'mark_seller_order_item_rejected',
  'subscribe',
  'unsubscribe',
  'create_report',
  'create_information_request',
])
