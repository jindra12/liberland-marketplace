import type { McpEntity } from './types'

export type McpFieldSchema = {
  type: 'string' | 'number' | 'boolean' | 'date' | 'relation'
  operators: string[]
  description: string
}

export type EntityDefinition = {
  collection: string
  root: string
  item: string
  input: string
  updateInput: string
  selection: string
}

const definitions: Record<McpEntity, EntityDefinition> = {
  companies: { collection: 'companies', root: 'Companies', item: 'Company', input: 'MutationCompanyInput', updateInput: 'MutationCompanyUpdateInput', selection: 'id serverURL name description website phone email isPrivate verification likeCount cryptoAddresses { chain address } image { id url alt filename width height mimeType } identity { id serverURL name description website }' },
  products: { collection: 'products', root: 'Products', item: 'Product', input: 'MutationProductInput', updateInput: 'MutationProductUpdateInput', selection: 'id serverURL name description url inventory orderable likeCount priceInUSD priceInETH priceInSOL priceInTRX cryptoAddresses { chain address } parameters { id name values { id key name default } } relatedProducts { id serverURL name } company { id serverURL name description cryptoAddresses { chain address } } image { id url alt filename width height mimeType }' },
  jobs: { collection: 'jobs', root: 'Jobs', item: 'Job', input: 'MutationJobInput', updateInput: 'MutationJobUpdateInput', selection: 'id serverURL title description location employmentType positions postedAt isActive applyUrl likeCount company { id serverURL name description } image { id url alt filename width height mimeType }' },
  ventures: { collection: 'ventures', root: 'Startups', item: 'Startup', input: 'MutationStartupInput', updateInput: 'MutationStartupUpdateInput', selection: 'id serverURL title description stage lookingFor alreadyHave likeCount fundsNeeded { amount currency } company { id serverURL name description } identity { id serverURL name description } image { id url alt filename width height mimeType }' },
  identities: { collection: 'identities', root: 'Identities', item: 'Identity', input: 'MutationIdentityInput', updateInput: 'MutationIdentityUpdateInput', selection: 'id serverURL name description website likeCount itemCount image { id url alt filename width height mimeType }' },
  posts: { collection: 'posts', root: 'Posts', item: 'Post', input: 'MutationPostInput', updateInput: 'MutationPostUpdateInput', selection: 'id serverURL title slug content repost publishedAt likeCount company { id serverURL name description } heroImage { id url alt filename width height mimeType } meta { title description }' },
  comments: { collection: 'comments', root: 'Comments', item: 'Comment', input: 'MutationCommentInput', updateInput: 'MutationCommentUpdateInput', selection: 'id content createdAt updatedAt likeCount replyCount company { id serverURL name } createdBy { id name email } replyPostRelationTo replyPostValue' },
  orders: { collection: 'orders', root: 'Orders', item: 'Order', input: 'MutationOrderInput', updateInput: 'MutationOrderUpdateInput', selection: 'id status payerAddress currency amount customerEmail createdAt updatedAt customer { id name email } items { id quantity product { id serverURL name } variant { id title } }' },
  carts: { collection: 'carts', root: 'Carts', item: 'Cart', input: 'MutationCartInput', updateInput: 'MutationCartUpdateInput', selection: 'id status currency subtotal createdAt updatedAt purchasedAt customer { id name email } items { id quantity product { id serverURL name } variant { id title } }' },
  users: { collection: 'users', root: 'Users', item: 'User', input: 'MutationUserInput', updateInput: 'MutationUserUpdateInput', selection: 'id name email phone createdAt updatedAt' },
  media: { collection: 'media', root: 'Media', item: 'Media', input: 'MutationMediaInput', updateInput: 'MutationMediaUpdateInput', selection: 'id url alt filename width height mimeType filesize createdAt updatedAt' },
  syndications: { collection: 'syndications', root: 'Syndications', item: 'Syndication', input: 'MutationSyndicationInput', updateInput: 'MutationSyndicationUpdateInput', selection: 'id name url description autoEnable nsfw _status createdAt updatedAt' },
  reports: { collection: 'reports', root: 'Reports', item: 'Report', input: 'MutationReportInput', updateInput: 'MutationReportUpdateInput', selection: 'id userId contentLink reason status createdAt updatedAt' },
  'information-requests': { collection: 'information-requests', root: 'InformationRequests', item: 'InformationRequest', input: 'mutationInformationRequestInput', updateInput: 'mutationInformationRequestUpdateInput', selection: 'id reason createdAt updatedAt user { id name email }' },
  'notification-subscriptions': { collection: 'notification-subscriptions', root: 'NotificationSubscriptions', item: 'NotificationSubscription', input: 'MutationNotificationSubscriptionInput', updateInput: 'MutationNotificationSubscriptionUpdateInput', selection: 'id targetCollection targetID createdAt updatedAt' },
  subscribers: { collection: 'subscribers', root: 'Subscribers', item: 'Subscriber', input: 'MutationSubscriberInput', updateInput: 'MutationSubscriberUpdateInput', selection: 'id email isActive createdAt updatedAt' },
}

export const getEntityDefinition = (entity: McpEntity): EntityDefinition => definitions[entity]
export const getEntityCatalog = (): McpEntity[] => Object.keys(definitions) as McpEntity[]

const textOperators = ['equals', 'not_equals', 'contains', 'exists']
const numericOperators = ['equals', 'not_equals', 'greater_than', 'less_than', 'exists']
const relationOperators = ['equals', 'not_equals', 'exists']

export const getEntitySchema = (entity: McpEntity): { searchableFields: string[]; fields: Record<string, McpFieldSchema> } => {
  const common: Record<string, McpFieldSchema> = {
    id: { type: 'string', operators: ['equals', 'not_equals', 'in'], description: 'Entity identifier.' },
    createdAt: { type: 'date', operators: ['equals', 'greater_than', 'less_than'], description: 'Creation timestamp.' },
    updatedAt: { type: 'date', operators: ['equals', 'greater_than', 'less_than'], description: 'Last update timestamp.' },
  }

  switch (entity) {
    case 'products':
      return { searchableFields: ['name', 'description', 'url'], fields: { ...common,
        name: { type: 'string', operators: textOperators, description: 'Product or service name.' },
        orderable: { type: 'boolean', operators: ['equals'], description: 'Whether the item can be ordered.' },
        priceInETH: { type: 'string', operators: ['equals', 'exists'], description: 'Whether an ETH price is configured.' },
        priceInSOL: { type: 'string', operators: ['equals', 'exists'], description: 'Whether a SOL price is configured.' },
        priceInTRX: { type: 'string', operators: ['equals', 'exists'], description: 'Whether a TRX price is configured.' },
        inventory: { type: 'number', operators: numericOperators, description: 'Available inventory.' },
        cryptoAddresses__chain: { type: 'string', operators: ['equals', 'in', 'exists'], description: 'Payment chain configured for the product.' },
        cryptoAddresses__address: { type: 'string', operators: ['equals', 'exists'], description: 'Payment address configured for the product.' },
        company: { type: 'relation', operators: relationOperators, description: 'Owning company identifier.' },
      } }
    case 'companies':
      return { searchableFields: ['name', 'description', 'website'], fields: { ...common,
        name: { type: 'string', operators: textOperators, description: 'Company name.' },
        cryptoAddresses__chain: { type: 'string', operators: ['equals', 'in', 'exists'], description: 'Payment chain configured for the company.' },
        cryptoAddresses__address: { type: 'string', operators: ['equals', 'exists'], description: 'Payment address configured for the company.' },
        identity: { type: 'relation', operators: relationOperators, description: 'Owning identity identifier.' },
      } }
    case 'jobs':
      return { searchableFields: ['title', 'description', 'location'], fields: { ...common,
        title: { type: 'string', operators: textOperators, description: 'Job title.' },
        isActive: { type: 'boolean', operators: ['equals'], description: 'Whether the job is active.' },
        company: { type: 'relation', operators: relationOperators, description: 'Hiring company identifier.' },
      } }
    default:
      return { searchableFields: ['title', 'name', 'description'], fields: common }
  }
}
