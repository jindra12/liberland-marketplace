import type { GraphQLExtension, PayloadRequest } from 'payload'
import type { Where } from 'payload'

import type { Order, Product } from '@/payload-types'
import { toStringID } from '@/utilities/toStringID'
import { updateAtomically } from '@/utilities/atomicUpdates/utils'
import chunk from 'lodash/chunk.js'

type GraphQLContext = {
  req: PayloadRequest
}

type GraphQLFactory = typeof import('graphql')

type SellerOrderPaymentProof = {
  product: string | Product
  chain: 'ethereum' | 'solana' | 'tron'
  transactionHash: string
  fulfilled?: boolean | null
  rejected?: boolean | null
  id?: string | null
}

type SellerOrderDoc = Omit<
  Pick<
    Order,
    'createdAt' | 'customerEmail' | 'id' | 'items' | 'payerAddress' | 'shippingAddress' | 'status'
  >,
  never
> & {
  paymentProofs?: SellerOrderPaymentProof[] | null
}

type SellerProductDoc = Pick<
  Product,
  'company' | 'createdBy' | 'createdAt' | 'id' | 'name' | 'updatedAt'
>

export type SellerOrdersRequest = PayloadRequest

type SellerOrderProductsArgs = {
  fulfilled?: boolean | null
  rejected?: boolean | null
  limit?: number | null
  page?: number | null
}

type UpdateSellerOrderProductFulfilledArgs = {
  fulfilled: boolean
  orderId: string
  paymentProofId: string
}

type UpdateSellerOrderProductRejectedArgs = {
  orderId: string
  paymentProofId: string
  rejected: boolean
}

type SellerOrderProductPaymentProof = {
  chain: 'ethereum' | 'solana' | 'tron'
  fulfilled: boolean
  id: string
  rejected: boolean
  transactionHash: string
}

type SellerOrderProductListing = {
  id: string
  chain: 'ethereum' | 'solana' | 'tron'
  fulfilled: boolean
  customerEmail: string | null | undefined
  orderCreatedAt: string
  orderId: string
  orderStatus: string
  payerAddress: string | null | undefined
  paymentProof: SellerOrderProductPaymentProof
  paymentProofId: string
  product: SellerProductDoc
  productId: string
  quantity: number
  shippingAddress: SellerOrderDoc['shippingAddress']
  transactionHash: string
  rejected: boolean
}

type SellerOrderProductsPage = {
  docs: SellerOrderProductListing[]
  hasNextPage: boolean
  hasPrevPage: boolean
  limit: number
  page: number
  totalDocs: number
  totalPages: number
}

type ProductCatalog = {
  ids: string[]
  products: Map<string, SellerProductDoc>
}

type OrderItemRow = NonNullable<SellerOrderDoc['items']>[number]

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100
const ORDER_PAGE_SIZE = 50
let shippingAddressType: import('graphql').GraphQLObjectType | null = null

const getExistingField = ({ fields, name }: { fields: Record<string, unknown>; name: string }) => {
  const field = fields[name]

  if (!field || typeof field !== 'object' || !('type' in field)) {
    throw new Error(`Missing GraphQL field: ${name}`)
  }

  return field as { type: import('graphql').GraphQLOutputType }
}

const buildShippingAddressType = (graphQL: GraphQLFactory) => {
  if (shippingAddressType) {
    return shippingAddressType
  }

  shippingAddressType = new graphQL.GraphQLObjectType({
    fields: {
      addressLine1: {
        type: graphQL.GraphQLString,
      },
      addressLine2: {
        type: graphQL.GraphQLString,
      },
      city: {
        type: graphQL.GraphQLString,
      },
      company: {
        type: graphQL.GraphQLString,
      },
      country: {
        type: graphQL.GraphQLString,
      },
      firstName: {
        type: graphQL.GraphQLString,
      },
      lastName: {
        type: graphQL.GraphQLString,
      },
      phone: {
        type: graphQL.GraphQLString,
      },
      postalCode: {
        type: graphQL.GraphQLString,
      },
      state: {
        type: graphQL.GraphQLString,
      },
      title: {
        type: graphQL.GraphQLString,
      },
    },
    name: 'SellerOrderShippingAddress',
  })

  return shippingAddressType
}

const requireAuthorizedUser = ({
  graphQL,
  req,
}: {
  graphQL: GraphQLFactory
  req: PayloadRequest
}) => {
  if (!req.user) {
    throw new graphQL.GraphQLError('Unauthorized.', {
      extensions: {
        code: 'UNAUTHORIZED',
      },
    })
  }
}

const getUserID = (user: SellerOrdersRequest['user']): string | null => {
  if (!user?.id) {
    return null
  }

  return String(user.id)
}

const loadProductCatalog = async ({
  req,
  productIDs,
}: {
  req: SellerOrdersRequest
  productIDs: string[]
}): Promise<ProductCatalog> => {
  const userID = getUserID(req.user)
  if (!userID) {
    return {
      ids: [],
      products: new Map<string, SellerProductDoc>(),
    }
  }

  const ownedByUserWhere: Where = {
    createdBy: {
      equals: userID,
    },
  }

  const productDocs = await chunk(Array.from(new Set(productIDs)), 100).reduce(
    async (previous, ids) => {
      const docs = await previous
      const products = await req.payload.find({
        collection: 'products',
        depth: 0,
        limit: 100,
        overrideAccess: true,
        pagination: true,
        req,
        select: {
          createdBy: true,
          company: true,
          createdAt: true,
          id: true,
          name: true,
          updatedAt: true,
        },
        sort: '-createdAt',
        where: { and: [ownedByUserWhere, { id: { in: ids } }] },
      })
      return [...docs, ...products.docs]
    },
    Promise.resolve<SellerProductDoc[]>([]),
  )

  const productEntries = productDocs
    .map((product) => {
      const productID = toStringID(product.id)
      if (!productID) {
        return null
      }

      return [productID, product] as const
    })
    .filter((entry): entry is readonly [string, SellerProductDoc] => Boolean(entry))

  return {
    ids: productEntries.map(([productID]) => productID),
    products: new Map(productEntries),
  }
}

const getOrderProductQuantity = ({
  items,
  productID,
}: {
  items: OrderItemRow[] | null | undefined
  productID: string
}): number => {
  if (!Array.isArray(items)) {
    return 0
  }

  return items.reduce((total, item) => {
    if (toStringID(item.product) !== productID) {
      return total
    }

    return total + Number(item.quantity ?? 0)
  }, 0)
}

const buildListing = async ({
  fulfilled,
  rejected,
  limit,
  page,
  req,
}: {
  fulfilled?: boolean | null
  rejected?: boolean | null
  limit: number
  page: number
  req: SellerOrdersRequest
}): Promise<SellerOrderProductsPage> => {
  const targetStart = (page - 1) * limit
  const targetEnd = targetStart + limit
  const docs: SellerOrderProductListing[] = []
  let totalDocs = 0
  let hasMore = true
  let orderPage = 1
  const orderWhere: Where = {
    'paymentProofs.product.createdBy': {
      equals: getUserID(req.user),
    },
  }

  if (!getUserID(req.user)) {
    return {
      docs,
      hasNextPage: false,
      hasPrevPage: page > 1,
      limit,
      page,
      totalDocs: 0,
      totalPages: 0,
    }
  }

  while (hasMore) {
    const orders = (await req.payload.find({
      collection: 'orders',
      depth: 0,
      limit: ORDER_PAGE_SIZE,
      overrideAccess: true,
      pagination: true,
      page: orderPage,
      req,
      sort: '-createdAt',
      where: orderWhere,
    })) as { docs: SellerOrderDoc[]; hasNextPage: boolean }

    const productCatalog = await loadProductCatalog({
      req,
      productIDs: orders.docs.flatMap((order) =>
        (order.paymentProofs || [])
          .map((proof) => toStringID(proof.product))
          .filter((id): id is string => Boolean(id)),
      ),
    })

    const pageDocs = await Promise.all(
      orders.docs.flatMap((order) => {
        const paymentProofs = Array.isArray(order.paymentProofs) ? order.paymentProofs : []

        return paymentProofs.map(
          async (paymentProof): Promise<SellerOrderProductListing | null> => {
            const productID = toStringID(paymentProof.product)
            if (!productID) {
              return null
            }

            const product = productCatalog.products.get(productID)
            if (!product) {
              return null
            }

            const isFulfilled = Boolean(paymentProof.fulfilled)
            if (typeof fulfilled === 'boolean' && isFulfilled !== fulfilled) {
              return null
            }

            const isRejected = Boolean(paymentProof.rejected)
            if (typeof rejected === 'boolean' && isRejected !== rejected) {
              return null
            }

            const paymentProofId = toStringID(paymentProof.id)
            if (!paymentProofId) {
              return null
            }

            const nextIndex = totalDocs
            totalDocs += 1
            if (nextIndex < targetStart || nextIndex >= targetEnd) {
              return null
            }

            return {
              id: paymentProofId,
              chain: paymentProof.chain,
              fulfilled: isFulfilled,
              customerEmail: order.customerEmail,
              orderCreatedAt: order.createdAt,
              orderId: order.id,
              orderStatus: String(order.status ?? ''),
              payerAddress: order.payerAddress,
              paymentProof: {
                chain: paymentProof.chain,
                fulfilled: isFulfilled,
                id: paymentProofId,
                rejected: isRejected,
                transactionHash: paymentProof.transactionHash,
              },
              paymentProofId,
              product,
              productId: productID,
              quantity: getOrderProductQuantity({
                items: order.items,
                productID,
              }),
              shippingAddress: order.shippingAddress,
              rejected: isRejected,
              transactionHash: paymentProof.transactionHash,
            }
          },
        )
      }),
    )

    docs.push(...pageDocs.filter((doc): doc is SellerOrderProductListing => doc !== null))
    hasMore = orders.hasNextPage
    orderPage += 1
  }

  const totalPages = totalDocs === 0 ? 0 : Math.ceil(totalDocs / limit)

  return {
    docs,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    limit,
    page,
    totalDocs,
    totalPages,
  }
}

export const getSellerOrderProducts = async ({
  fulfilled,
  rejected,
  limit,
  page,
  req,
}: {
  fulfilled?: boolean | null
  rejected?: boolean | null
  limit?: number | null
  page?: number | null
  req: SellerOrdersRequest
}): Promise<SellerOrderProductsPage> => {
  const normalizedLimit = Math.max(1, Math.min(Number(limit ?? DEFAULT_LIMIT), MAX_LIMIT))
  const normalizedPage = Math.max(1, Number(page ?? 1))
  return buildListing({
    fulfilled,
    rejected,
    limit: normalizedLimit,
    page: normalizedPage,
    req,
  })
}

const updateSellerOrderProductState = async ({
  paymentProofKey,
  paymentProofValue,
  orderId,
  paymentProofId,
  req,
}: {
  orderId: string
  paymentProofId: string
  paymentProofKey: 'fulfilled' | 'rejected'
  paymentProofValue: boolean
  req: SellerOrdersRequest
}): Promise<SellerOrderProductListing> => {
  const order = await updateAtomically({
    collection: 'orders',
    id: orderId,
    req,
    update: async (current) => {
      const proof = current.paymentProofs?.find((entry) => toStringID(entry.id) === paymentProofId)
      if (!proof) {
        throw new Error('Payment proof not found.')
      }
      const productID = toStringID(proof.product)
      if (!productID) {
        throw new Error('Payment proof is missing a product.')
      }
      const catalog = await loadProductCatalog({ req, productIDs: [productID] })
      if (!catalog.products.has(productID)) {
        throw new Error('You do not own this product.')
      }
      if (paymentProofKey === 'fulfilled' && paymentProofValue && current.status !== 'completed') {
        throw new Error('Fulfillment requires a verified completed order.')
      }
      const opposite = paymentProofKey === 'fulfilled' ? 'rejected' : 'fulfilled'
      if (Boolean(proof[paymentProofKey]) === paymentProofValue && !proof[opposite]) {
        return null
      }
      return {
        paymentProofs: current.paymentProofs!.map((entry) =>
          toStringID(entry.id) === paymentProofId
            ? { ...entry, [paymentProofKey]: paymentProofValue, [opposite]: false }
            : entry,
        ),
      }
    },
  })
  const currentProof = order.paymentProofs!.find(
    (entry) => toStringID(entry.id) === paymentProofId,
  )!
  const productID = toStringID(currentProof.product)!
  const productCatalog = await loadProductCatalog({ req, productIDs: [productID] })
  const product = productCatalog.products.get(productID)!
  return {
    id: paymentProofId,
    chain: currentProof.chain,
    fulfilled: Boolean(currentProof.fulfilled),
    customerEmail: order.customerEmail,
    orderCreatedAt: order.createdAt,
    orderId: order.id,
    orderStatus: String(order.status ?? ''),
    payerAddress: order.payerAddress,
    paymentProof: {
      chain: currentProof.chain,
      fulfilled: Boolean(currentProof.fulfilled),
      id: paymentProofId,
      rejected: Boolean(currentProof.rejected),
      transactionHash: currentProof.transactionHash,
    },
    paymentProofId,
    product,
    productId: productID,
    quantity: getOrderProductQuantity({
      items: order.items,
      productID,
    }),
    shippingAddress: order.shippingAddress,
    rejected: Boolean(currentProof.rejected),
    transactionHash: currentProof.transactionHash,
  }
}
export const updateSellerOrderProductFulfilled = async ({
  fulfilled,
  orderId,
  paymentProofId,
  req,
}: UpdateSellerOrderProductFulfilledArgs & {
  req: SellerOrdersRequest
}): Promise<SellerOrderProductListing> => {
  return updateSellerOrderProductState({
    orderId,
    paymentProofId,
    paymentProofKey: 'fulfilled',
    paymentProofValue: fulfilled,
    req,
  })
}

export const updateSellerOrderProductRejected = async ({
  orderId,
  paymentProofId,
  rejected,
  req,
}: UpdateSellerOrderProductRejectedArgs & {
  req: SellerOrdersRequest
}): Promise<SellerOrderProductListing> => {
  return updateSellerOrderProductState({
    orderId,
    paymentProofId,
    paymentProofKey: 'rejected',
    paymentProofValue: rejected,
    req,
  })
}

export const sellerOrderGraphQLQueries: GraphQLExtension = (graphQL: GraphQLFactory, context) => {
  const productField = getExistingField({
    fields: context.Query.fields,
    name: 'Product',
  })
  const shippingAddressType = buildShippingAddressType(graphQL)

  const paymentProofType = new graphQL.GraphQLObjectType({
    fields: {
      chain: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
      fulfilled: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLBoolean),
      },
      rejected: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLBoolean),
      },
      id: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
      transactionHash: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
    },
    name: 'SellerOrderProductPaymentProof',
  })

  const sellerOrderProductType = new graphQL.GraphQLObjectType({
    fields: {
      chain: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
      fulfilled: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLBoolean),
      },
      rejected: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLBoolean),
      },
      orderCreatedAt: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
      id: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
      orderId: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
      orderStatus: {
        type: graphQL.GraphQLString,
      },
      customerEmail: {
        type: graphQL.GraphQLString,
      },
      payerAddress: {
        type: graphQL.GraphQLString,
      },
      paymentProof: {
        type: new graphQL.GraphQLNonNull(paymentProofType),
      },
      paymentProofId: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
      product: {
        type: productField.type,
      },
      productId: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
      quantity: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLInt),
      },
      shippingAddress: {
        type: shippingAddressType,
      },
      transactionHash: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
    },
    name: 'SellerOrderProduct',
  })

  const sellerOrderProductsPageType = new graphQL.GraphQLObjectType({
    fields: {
      docs: {
        type: new graphQL.GraphQLNonNull(
          new graphQL.GraphQLList(new graphQL.GraphQLNonNull(sellerOrderProductType)),
        ),
      },
      hasNextPage: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLBoolean),
      },
      hasPrevPage: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLBoolean),
      },
      limit: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLInt),
      },
      page: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLInt),
      },
      totalDocs: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLInt),
      },
      totalPages: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLInt),
      },
    },
    name: 'SellerOrderProductsPage',
  })

  return {
    sellerOrderProducts: {
      args: {
        fulfilled: {
          type: graphQL.GraphQLBoolean,
        },
        rejected: {
          type: graphQL.GraphQLBoolean,
        },
        limit: {
          type: graphQL.GraphQLInt,
        },
        page: {
          type: graphQL.GraphQLInt,
        },
      },
      resolve: async (_source: unknown, args: SellerOrderProductsArgs, context: GraphQLContext) => {
        requireAuthorizedUser({
          graphQL,
          req: context.req,
        })

        return getSellerOrderProducts({
          fulfilled: args.fulfilled ?? null,
          rejected: args.rejected ?? null,
          limit: args.limit ?? null,
          page: args.page ?? null,
          req: context.req as SellerOrdersRequest,
        })
      },
      type: new graphQL.GraphQLNonNull(sellerOrderProductsPageType),
    },
  }
}

export const sellerOrderGraphQLMutations: GraphQLExtension = (graphQL: GraphQLFactory, context) => {
  const productField = getExistingField({
    fields: context.Query.fields,
    name: 'Product',
  })
  const shippingAddressType = buildShippingAddressType(graphQL)

  const paymentProofType = new graphQL.GraphQLObjectType({
    fields: {
      chain: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
      fulfilled: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLBoolean),
      },
      rejected: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLBoolean),
      },
      id: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
      transactionHash: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
    },
    name: 'SellerOrderProductPaymentProofUpdate',
  })

  const sellerOrderProductTypeResult = new graphQL.GraphQLObjectType({
    fields: {
      chain: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
      fulfilled: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLBoolean),
      },
      rejected: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLBoolean),
      },
      orderCreatedAt: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
      id: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
      orderId: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
      orderStatus: {
        type: graphQL.GraphQLString,
      },
      payerAddress: {
        type: graphQL.GraphQLString,
      },
      paymentProof: {
        type: new graphQL.GraphQLNonNull(paymentProofType),
      },
      paymentProofId: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
      product: {
        type: productField.type,
      },
      productId: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
      quantity: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLInt),
      },
      shippingAddress: {
        type: shippingAddressType,
      },
      transactionHash: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
    },
    name: 'SellerOrderProductMutationResult',
  })

  return {
    updateSellerOrderProductFulfilled: {
      args: {
        fulfilled: {
          type: new graphQL.GraphQLNonNull(graphQL.GraphQLBoolean),
        },
        orderId: {
          type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
        },
        paymentProofId: {
          type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
        },
      },
      resolve: async (
        _source: unknown,
        args: UpdateSellerOrderProductFulfilledArgs,
        context: GraphQLContext,
      ) => {
        requireAuthorizedUser({
          graphQL,
          req: context.req,
        })

        return updateSellerOrderProductFulfilled({
          fulfilled: args.fulfilled,
          orderId: args.orderId,
          paymentProofId: args.paymentProofId,
          req: context.req as SellerOrdersRequest,
        })
      },
      type: new graphQL.GraphQLNonNull(sellerOrderProductTypeResult),
    },
    updateSellerOrderProductRejected: {
      args: {
        orderId: {
          type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
        },
        paymentProofId: {
          type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
        },
        rejected: {
          type: new graphQL.GraphQLNonNull(graphQL.GraphQLBoolean),
        },
      },
      resolve: async (
        _source: unknown,
        args: UpdateSellerOrderProductRejectedArgs,
        context: GraphQLContext,
      ) => {
        requireAuthorizedUser({
          graphQL,
          req: context.req,
        })

        return updateSellerOrderProductRejected({
          orderId: args.orderId,
          paymentProofId: args.paymentProofId,
          rejected: args.rejected,
          req: context.req as SellerOrdersRequest,
        })
      },
      type: new graphQL.GraphQLNonNull(sellerOrderProductTypeResult),
    },
  }
}
