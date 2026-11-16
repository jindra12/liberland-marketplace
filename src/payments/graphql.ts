import memoize from 'lodash/memoize.js'
import type { GraphQLExtension, PayloadRequest } from 'payload'
import stringify from 'fast-json-stable-stringify'
import { z } from 'zod'
import { protectGraphQLRequest } from '@/graphql/utils'
import { createCheckoutSession, findCheckoutSession, publicCheckoutSession } from './service'
import type { createCheckoutSchema } from './utils'
import { createOrderCheckoutSession, verifyOrderCheckoutSession } from './orderCheckout/service'

const getGraphQLTypes = memoize((graphQL: Parameters<GraphQLExtension>[0]) => {
  const {
    GraphQLBoolean,
    GraphQLInputObjectType,
    GraphQLInt,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLString,
  } = graphQL
  const settlementType = new GraphQLObjectType({
    name: 'HostedCheckoutSettlement',
    fields: {
      chainId: { type: new GraphQLNonNull(GraphQLInt) },
      tokenAddress: { type: new GraphQLNonNull(GraphQLString) },
      decimals: { type: new GraphQLNonNull(GraphQLInt) },
      symbol: { type: new GraphQLNonNull(GraphQLString) },
    },
  })
  const purchaseDataType = new GraphQLObjectType({
    name: 'HostedCheckoutPurchaseData',
    fields: { nswapSessionId: { type: new GraphQLNonNull(GraphQLString) } },
  })
  const sessionType = new GraphQLObjectType({
    name: 'HostedCheckoutSession',
    fields: {
      sessionId: { type: new GraphQLNonNull(GraphQLString) },
      title: { type: new GraphQLNonNull(GraphQLString) },
      status: { type: new GraphQLNonNull(GraphQLString) },
      paymentRecorded: { type: new GraphQLNonNull(GraphQLBoolean) },
      expiresAt: { type: new GraphQLNonNull(GraphQLString) },
      amountUsdCents: { type: new GraphQLNonNull(GraphQLInt) },
      receiver: { type: new GraphQLNonNull(GraphQLString) },
      thirdwebClientId: { type: new GraphQLNonNull(GraphQLString) },
      returnUrl: { type: GraphQLString },
      checkoutUrl: { type: GraphQLString },
      settlement: { type: new GraphQLNonNull(settlementType) },
      purchaseData: { type: new GraphQLNonNull(purchaseDataType) },
    },
  })
  const checkoutInput = new GraphQLInputObjectType({
    name: 'HostedCheckoutInput',
    fields: {
      companyId: { type: new GraphQLNonNull(GraphQLString) },
      productId: { type: GraphQLString },
      quantity: { type: GraphQLInt },
      amountUsdCents: { type: GraphQLInt },
      externalReference: { type: GraphQLString },
      returnUrl: { type: GraphQLString },
    },
  })

  return { sessionType, checkoutInput }
})

export const hostedCheckoutGraphQLQueries: GraphQLExtension = (graphQL) => {
  const { GraphQLNonNull, GraphQLString } = graphQL
  const { sessionType } = getGraphQLTypes(graphQL)
  return {
    hostedCheckoutSession: {
      type: new GraphQLNonNull(sessionType),
      args: { sessionId: { type: new GraphQLNonNull(GraphQLString) } },
      resolve: async (
        _source: null,
        args: { sessionId: string },
        context: { req: PayloadRequest },
      ) => {
        await protectGraphQLRequest(context.req)
        const session = await findCheckoutSession(context.req, z.uuid().parse(args.sessionId))
        return publicCheckoutSession(session)
      },
    },
  }
}

export const hostedCheckoutGraphQLMutations: GraphQLExtension = (graphQL) => {
  const { GraphQLNonNull, GraphQLString } = graphQL
  const { sessionType, checkoutInput } = getGraphQLTypes(graphQL)
  return {
    createOrderCheckoutSession: {
      type: new GraphQLNonNull(sessionType),
      args: {
        orderId: { type: new GraphQLNonNull(GraphQLString) },
        recipient: { type: new GraphQLNonNull(GraphQLString) },
      },
      resolve: async (
        _source: null,
        args: { orderId: string; recipient: string },
        context: { req: PayloadRequest },
      ) => {
        await protectGraphQLRequest(context.req)
        return publicCheckoutSession(
          await createOrderCheckoutSession(context.req, args.orderId, args.recipient),
        )
      },
    },
    verifyOrderCheckoutSession: {
      type: new GraphQLNonNull(sessionType),
      args: { sessionId: { type: new GraphQLNonNull(GraphQLString) } },
      resolve: async (
        _source: null,
        args: { sessionId: string },
        context: { req: PayloadRequest },
      ) => {
        await protectGraphQLRequest(context.req)
        const session = await findCheckoutSession(context.req, z.uuid().parse(args.sessionId))
        return publicCheckoutSession(await verifyOrderCheckoutSession(context.req, session))
      },
    },
    createHostedCheckoutSession: {
      type: new GraphQLNonNull(sessionType),
      args: { input: { type: new GraphQLNonNull(checkoutInput) } },
      resolve: async (
        _source: null,
        args: { input: z.input<typeof createCheckoutSchema> },
        context: { req: PayloadRequest },
      ) => {
        await protectGraphQLRequest(context.req)
        // Merchant signatures cover canonical input, independent of GraphQL field order.
        return createCheckoutSession(context.req, stringify(args.input))
      },
    },
  }
}
