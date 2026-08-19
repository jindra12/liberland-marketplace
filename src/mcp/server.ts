import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getEntityCatalog, getEntityDefinition, getEntitySchema } from './catalog'
import { executeGraphQL } from './graphql'
import { addCartItemForMcp, clearCartForMcp, getCartForMcp, removeCartItemForMcp, setCartItemQuantityForMcp } from './cart'
import { getPayloadEntitySchema } from './schema'
import { createPost, createReply, deleteComment, deleteShippingAddress, getWalletCapabilities, listSellerOrders, listShippingAddresses, preparePayment, saveShippingAddress, unsubscribe, updateComment, updatePost, updateSellerOrderProductFulfilled, updateSellerOrderProductRejected, updateShippingAddress } from './actions'
import { MCP_ENTITIES, type McpEntity, type McpJsonObject, type McpJsonValue } from './types'

const entitySchema = z.enum(MCP_ENTITIES)
const jsonObjectSchema = z.record(z.string(), z.json())
const DISCOVERY_INSTRUCTIONS = 'This is one independent syndicated Nswap marketplace backend. Nswap is a gateway over multiple such backends; each backend owns its own users, entities, permissions, carts, orders, and GraphQL schema. Its listed syndication directory is read-only discovery data: return published syndicated server URLs through list_syndicated_servers, but do not add, remove, or mutate directory entries through MCP. The gateway maintains a separate per-user active session cache and may call this tool on every reachable backend to build a unique network directory. Read operations can be aggregated across backends, while writes, carts, payments, comments, posts, and fulfillment must be sent to the backend that owns the data. Before using another operation, call describe_backend and then describe_entity_schema for the relevant entity. Do not invent entity names, fields, filters, URLs, or mutation shapes.'

const result = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value) }],
})

const toGraphQLLiteral = (value: McpJsonValue): string => {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `[${value.map(toGraphQLLiteral).join(', ')}]`
  return `{ ${Object.entries(value).map(([key, nestedValue]) => `${key}: ${toGraphQLLiteral(nestedValue)}`).join(', ')} }`
}

const buildWhere = (where: McpJsonObject | undefined): string => {
  if (!where || Object.keys(where).length === 0) return ''
  return ` where: ${toGraphQLLiteral(where)}`
}

const executeEntityQuery = async ({ authorization, entity, id, limit, page, where }: {
  authorization?: string
  entity: McpEntity
  id?: string
  limit?: number
  page?: number
  where?: McpJsonObject
}) => {
  const definition = getEntityDefinition(entity)

  if (id) {
    const data = await executeGraphQL({
      authorization,
      query: `query Get${definition.item}($id: String!) { ${definition.item}(id: $id) { ${definition.selection} } }`,
      variables: { id },
    })
    return data[definition.item]
  }

  const data = await executeGraphQL({
    authorization,
    query: `query List${definition.item}s($page: Int!, $limit: Int!) { ${definition.root}(page: $page, limit: $limit${buildWhere(where)}) { totalDocs totalPages page hasNextPage docs { ${definition.selection} } } }`,
    variables: { page: page ?? 1, limit: limit ?? 20 },
  })
  return data[definition.root]
}

export const createBackendMcpServer = (authorization?: string): McpServer => {
  const server = new McpServer({ name: 'nswap-syndicated-backend', version: '1.0.0' }, { instructions: DISCOVERY_INSTRUCTIONS })

  server.registerTool('list_entities', {
    description: 'List companies, products/services, jobs, ventures, identities, posts, comments, orders, carts, users, media, syndications, reports, information requests, notification subscriptions, and subscribers through GraphQL.',
    inputSchema: {
      entity: entitySchema,
      page: z.number().int().positive().default(1),
      limit: z.number().int().positive().max(100).default(20),
      where: z.record(z.string(), z.unknown()).optional(),
    },
  }, async (args) => result(await executeEntityQuery({ authorization, ...args, where: args.where as McpJsonObject | undefined })))

  server.registerTool('search_entities', {
    description: 'Search any entity by text and optional GraphQL filters. For example, products can be filtered with { priceInETH: { exists: true }, orderable: { equals: true } }, and jobs can be filtered with { company: { equals: companyId } }.',
    inputSchema: {
      entity: entitySchema,
      query: z.string().min(1).max(200),
      page: z.number().int().positive().default(1),
      limit: z.number().int().positive().max(100).default(20),
      where: z.record(z.string(), z.unknown()).optional(),
    },
  }, async (args) => {
    const definition = getEntityDefinition(args.entity)
    const extraWhere = args.where as McpJsonObject | undefined
    const searchFilters: McpJsonValue[] = [{ title: { contains: args.query } }]
    if (extraWhere) searchFilters.push(extraWhere)
    const where: McpJsonObject = { AND: searchFilters }
    const data = await executeGraphQL({
      authorization,
      query: `query SearchEntities($page: Int!, $limit: Int!) { Searches(page: $page, limit: $limit, where: ${toGraphQLLiteral(where)}) { totalDocs totalPages page hasNextPage docs { title priority doc { relationTo value { ... on ${definition.item} { ${definition.selection} } } } } } }`,
      variables: { page: args.page, limit: 100 },
    })

    const searchResults = data.Searches

    if (!searchResults || typeof searchResults !== 'object' || Array.isArray(searchResults)) {
      return result(searchResults)
    }

    const matchingDocs = Array.isArray(searchResults.docs)
      ? searchResults.docs.filter((doc) => {
        if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false
        const relation = doc.doc
        return relation && typeof relation === 'object' && !Array.isArray(relation) && relation.relationTo === definition.collection
      }).slice(0, args.limit)
      : []

    return result({
      ...searchResults,
      docs: matchingDocs,
      totalDocs: matchingDocs.length,
      totalPages: matchingDocs.length > 0 ? 1 : 0,
      hasNextPage: false,
    })
  })

  server.registerTool('find_related_entities', {
    description: 'Find entities related to another entity. Use this for requests such as finding jobs for a company, products for a company, or ventures for an identity.',
    inputSchema: {
      entity: entitySchema,
      relatedEntity: entitySchema,
      relatedField: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
      relatedId: z.string().min(1),
      page: z.number().int().positive().default(1),
      limit: z.number().int().positive().max(100).default(20),
    },
  }, async (args) => result(await executeEntityQuery({
    authorization,
    entity: args.relatedEntity,
    page: args.page,
    limit: args.limit,
    where: { [args.relatedField]: { equals: args.relatedId } },
  })))

  server.registerTool('get_entity', {
    description: 'Retrieve one entity using the backend GraphQL API.',
    inputSchema: { entity: entitySchema, id: z.string().min(1) },
  }, async (args) => result(await executeEntityQuery({ authorization, ...args })))

  server.registerTool('describe_entity_schema', {
    description: 'Return the machine-readable searchable fields, filter operators, and field meanings for an entity before using list_entities, search_entities, or update_entity.',
    inputSchema: { entity: entitySchema },
  }, async (args) => result({ entity: args.entity, search: getEntitySchema(args.entity), payload: await getPayloadEntitySchema(args.entity) }))

  server.registerTool('cart_get', {
    description: 'Read one shopping cart by its secret. Keep the returned serverUrl and secret for checkout across multiple backends.',
    inputSchema: { secret: z.string().min(1) },
  }, async (args) => result(await getCartForMcp(authorization, args.secret)))

  server.registerTool('cart_add_item', {
    description: 'Shop by adding a product to this backend cart. Omit secret to create a new cart; retain the returned secret.',
    inputSchema: { secret: z.string().min(1).optional(), product: z.string().min(1), variant: z.string().min(1).optional(), quantity: z.number().int().positive(), parameters: z.array(jsonObjectSchema).optional() },
  }, async (args) => result(await addCartItemForMcp(authorization, args)))

  server.registerTool('cart_set_item_quantity', {
    description: 'Change one cart item quantity. Use quantity zero only through cart_remove_item.',
    inputSchema: { secret: z.string().min(1), itemId: z.string().min(1), quantity: z.number().int().positive() },
  }, async (args) => result(await setCartItemQuantityForMcp(authorization, args.secret, args.itemId, args.quantity)))

  server.registerTool('cart_remove_item', {
    description: 'Remove one item from a shopping cart.',
    inputSchema: { secret: z.string().min(1), itemId: z.string().min(1) },
  }, async (args) => result(await removeCartItemForMcp(authorization, args.secret, args.itemId)))

  server.registerTool('cart_clear', {
    description: 'Remove all items from a shopping cart.',
    inputSchema: { secret: z.string().min(1), confirmation: z.literal(true) },
  }, async (args) => result(await clearCartForMcp(authorization, args.secret)))

  server.registerTool('create_comment', {
    description: 'Create a comment as the authenticated user. The AI must show the exact text and target, and receive explicit confirmation before calling this tool.',
    inputSchema: {
      content: z.string().min(1).max(50000),
      company: z.string().min(1),
      replyPost: z.string().min(1),
      replyComment: z.string().min(1).optional(),
      confirmation: z.literal(true),
    },
  }, async (args) => {
    const data = await executeGraphQL({
      authorization,
      query: 'mutation CreateComment($data: MutationCommentInput!) { createComment(data: $data) { id content createdAt replyCount company { id serverURL name } replyComment { id } createdBy { id name email } } }',
      variables: {
        data: {
          content: args.content,
          company: args.company,
          replyPost: args.replyPost,
          ...(args.replyComment ? { replyComment: args.replyComment } : {}),
        },
      },
    })
    return result(data.createComment)
  })

  server.registerTool('wallet_capabilities', { description: 'Return the authenticated user wallets available for ETH, SOL, and TRX payment.', inputSchema: {} }, async () => result(await getWalletCapabilities(authorization)))
  server.registerTool('list_syndicated_servers', {
    description: 'Return the published syndicated backend URLs listed by this backend. This is read-only directory data and does not modify the gateway active session cache.',
    inputSchema: {},
  }, async () => {
    const listing = await executeEntityQuery({ authorization, entity: 'syndications', page: 1, limit: 100 }) as { docs?: Array<{ id?: string; name?: string; url?: string; description?: string | null }> }
    return result({ servers: (listing.docs ?? []).filter((entry) => entry.url).map((entry) => ({ id: entry.id, name: entry.name, serverUrl: entry.url, description: entry.description ?? null })) })
  })
  server.registerTool('prepare_payment', { description: 'Prepare an order for payment without signing or sending a transaction. Returns normalized chains, recipients, amounts, and wallets available for each required chain.', inputSchema: { orderId: z.string().min(1) } }, async (args) => result(await preparePayment(authorization, args.orderId)))
  server.registerTool('list_seller_orders', {
    description: 'List product/payment rows ordered by other users for the authenticated seller, matching the Orders tab. Use fulfilled or rejected filters to find pending work; each row includes orderId and paymentProofId for status updates.',
    inputSchema: { fulfilled: z.boolean().optional(), rejected: z.boolean().optional(), limit: z.number().int().positive().max(100).default(20), page: z.number().int().positive().default(1) },
  }, async (args) => result(await listSellerOrders(authorization, args)))
  server.registerTool('mark_seller_order_item_fulfilled', {
    description: 'Mark one product/payment row from the seller Orders tab as fulfilled after it has been shipped or delivered. Requires explicit confirmation.',
    inputSchema: { fulfilled: z.boolean().default(true), orderId: z.string().min(1), paymentProofId: z.string().min(1), confirmation: z.literal(true) },
  }, async (args) => result(await updateSellerOrderProductFulfilled(authorization, { fulfilled: args.fulfilled, orderId: args.orderId, paymentProofId: args.paymentProofId })))
  server.registerTool('mark_seller_order_item_rejected', {
    description: 'Mark one product/payment row from the seller Orders tab as rejected. Requires explicit confirmation.',
    inputSchema: { rejected: z.boolean().default(true), orderId: z.string().min(1), paymentProofId: z.string().min(1), confirmation: z.literal(true) },
  }, async (args) => result(await updateSellerOrderProductRejected(authorization, { rejected: args.rejected, orderId: args.orderId, paymentProofId: args.paymentProofId })))
  server.registerTool('list_shipping_addresses', { description: 'List the authenticated user saved shipping addresses. Add one before checkout if none exists.', inputSchema: {} }, async () => result(await listShippingAddresses(authorization)))
  server.registerTool('save_shipping_address', { description: 'Save or replace the authenticated user shipping address before checkout.', inputSchema: { address: jsonObjectSchema } }, async (args) => result(await saveShippingAddress(authorization, args.address as McpJsonObject)))
  server.registerTool('update_shipping_address', { description: 'Update the authenticated user saved shipping address before checkout.', inputSchema: { address: jsonObjectSchema } }, async (args) => result(await updateShippingAddress(authorization, args.address as McpJsonObject)))
  server.registerTool('delete_shipping_address', { description: 'Delete the authenticated user saved shipping address.', inputSchema: { confirmation: z.literal(true) } }, async () => result(await deleteShippingAddress(authorization)))
  server.registerTool('create_post', { description: 'Create a post as the authenticated user. Requires explicit publishing confirmation.', inputSchema: { data: jsonObjectSchema, confirmation: z.literal(true) } }, async (args) => result(await createPost(authorization, args.data as McpJsonObject)))
  server.registerTool('update_post', { description: 'Update a post owned by the authenticated user. Requires explicit confirmation.', inputSchema: { id: z.string().min(1), data: jsonObjectSchema, confirmation: z.literal(true) } }, async (args) => result(await updatePost(authorization, args.id, args.data as McpJsonObject)))
  server.registerTool('reply_to_comment', { description: 'Reply to a comment as the authenticated user. Requires explicit confirmation.', inputSchema: { content: z.string().min(1).max(50000), company: z.string().min(1), replyPost: z.string().min(1), replyComment: z.string().min(1), confirmation: z.literal(true) } }, async (args) => result(await createReply(authorization, { content: args.content, company: args.company, replyPost: args.replyPost, replyComment: args.replyComment })))
  server.registerTool('edit_comment', { description: 'Edit an owned comment. Requires explicit confirmation.', inputSchema: { id: z.string().min(1), content: z.string().min(1).max(50000), confirmation: z.literal(true) } }, async (args) => result(await updateComment(authorization, args.id, args.content)))
  server.registerTool('delete_comment', { description: 'Delete an owned comment. Requires explicit confirmation.', inputSchema: { id: z.string().min(1), confirmation: z.literal(true) } }, async (args) => result(await deleteComment(authorization, args.id)))
  server.registerTool('unsubscribe', { description: 'Remove an authenticated user subscription. Requires explicit confirmation.', inputSchema: { id: z.string().min(1), confirmation: z.literal(true) } }, async (args) => result(await unsubscribe(authorization, args.id)))

  server.registerTool('create_entity', {
    description: 'Create an entity through its generated GraphQL mutation and backend access rules.',
    inputSchema: { entity: entitySchema, data: jsonObjectSchema },
  }, async (args) => {
    const definition = getEntityDefinition(args.entity)
    const data = await executeGraphQL({ authorization, query: `mutation Create${definition.item}($data: ${definition.input}!) { create${definition.item}(data: $data) { ${definition.selection} } }`, variables: { data: args.data as McpJsonObject } })
    return result(data[`create${definition.item}`])
  })

  server.registerTool('update_entity', {
    description: 'Update an entity through its generated GraphQL mutation and backend access rules.',
    inputSchema: { entity: entitySchema, id: z.string().min(1), data: jsonObjectSchema },
  }, async (args) => {
    const definition = getEntityDefinition(args.entity)
    const data = await executeGraphQL({ authorization, query: `mutation Update${definition.item}($id: String!, $data: ${definition.updateInput}!) { update${definition.item}(id: $id, data: $data) { ${definition.selection} } }`, variables: { id: args.id, data: args.data as McpJsonObject } })
    return result(data[`update${definition.item}`])
  })

  server.registerTool('delete_entity', {
    description: 'Delete an entity through its generated GraphQL mutation. Requires explicit confirmation.',
    inputSchema: { entity: entitySchema, id: z.string().min(1), confirmation: z.literal(true) },
  }, async (args) => {
    const definition = getEntityDefinition(args.entity)
    const data = await executeGraphQL({ authorization, query: `mutation Delete${definition.item}($id: String!) { delete${definition.item}(id: $id) { id } }`, variables: { id: args.id } })
    return result(data[`delete${definition.item}`])
  })

  server.registerTool('like_entity', {
    description: 'Like or unlike a company, product, job, venture, identity, post, or comment.',
    inputSchema: { entity: z.enum(['companies', 'products', 'jobs', 'ventures', 'identities', 'posts', 'comments']), id: z.string().min(1), liked: z.boolean() },
  }, async (args) => {
    const data = await executeGraphQL({ authorization, query: `mutation SetLikeState($id: String!, $liked: Boolean!) { setLikeState(collection: ${args.entity}, id: $id, liked: $liked) { id hasLiked likeCount } }`, variables: { id: args.id, liked: args.liked } })
    return result(data.setLikeState)
  })

  server.registerTool('subscribe_to_entity', {
    description: 'Subscribe the authenticated user to updates for a company, product, job, venture, identity, or post.',
    inputSchema: { entity: z.enum(['companies', 'products', 'jobs', 'ventures', 'identities', 'posts']), id: z.string().min(1) },
  }, async (args) => {
    const targetCollection = args.entity === 'ventures' ? 'startups' : args.entity
    const data = await executeGraphQL({ authorization, query: `mutation Subscribe($targetID: String!) { createNotificationSubscription(data: { targetCollection: ${targetCollection}, targetID: $targetID }) { id } }`, variables: { targetID: args.id } })
    return result(data.createNotificationSubscription)
  })

  server.registerTool('create_report', {
    description: 'Create a moderation report using the backend GraphQL mutation.',
    inputSchema: { data: jsonObjectSchema },
  }, async (args) => {
    const data = await executeGraphQL({ authorization, query: 'mutation CreateReport($data: mutationReportInput!) { createReport(data: $data) { id contentLink reason createdAt userId { id } } }', variables: { data: args.data as McpJsonObject } })
    return result(data.createReport)
  })

  server.registerTool('create_information_request', {
    description: 'Create an information request using the backend GraphQL mutation.',
    inputSchema: { data: jsonObjectSchema },
  }, async (args) => {
    const data = await executeGraphQL({ authorization, query: 'mutation CreateInformationRequest($data: mutationInformationRequestInput!) { createInformationRequest(data: $data) { id reason createdAt user { id } } }', variables: { data: args.data as McpJsonObject } })
    return result(data.createInformationRequest)
  })

  server.registerTool('describe_backend', {
    description: 'FIRST STEP: describe this backend MCP server, its entities, schemas, supported filters, and operations before using any other tool.',
    inputSchema: {},
  }, async () => result({ name: 'nswap-syndicated-backend', entities: getEntityCatalog(), operations: ['describe_entity_schema', 'list', 'search', 'related', 'get', 'create', 'update', 'delete', 'cart_get', 'cart_add_item', 'cart_set_item_quantity', 'cart_remove_item', 'cart_clear', 'prepare_payment', 'list_shipping_addresses', 'save_shipping_address', 'update_shipping_address', 'delete_shipping_address', 'list_seller_orders', 'mark_seller_order_item_fulfilled', 'mark_seller_order_item_rejected', 'like', 'subscribe', 'report', 'information-request'] }))

  return server
}
