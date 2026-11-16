import memoize from 'lodash/memoize.js'
import type { GraphQLExtension } from 'payload'

export const getVentureIndexType = memoize((graphQL: Parameters<GraphQLExtension>[0]) => {
  const {
    GraphQLBoolean,
    GraphQLFloat,
    GraphQLInt,
    GraphQLList,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLString,
  } = graphQL
  const text = { type: new GraphQLNonNull(GraphQLString) }
  const integer = { type: new GraphQLNonNull(GraphQLInt) }
  const currencyType = new GraphQLObjectType({
    name: 'VenturePoolCurrency',
    fields: { address: text, symbol: text, decimals: integer },
  })
  const keyType = new GraphQLObjectType({
    name: 'VenturePoolKey',
    fields: { currency0: text, currency1: text, fee: integer, tickSpacing: integer, hooks: text },
  })
  const poolType = new GraphQLObjectType({
    name: 'VentureIndexedPool',
    fields: {
      id: text,
      key: { type: new GraphQLNonNull(keyType) },
      currency0: { type: new GraphQLNonNull(currencyType) },
      currency1: { type: new GraphQLNonNull(currencyType) },
    },
  })
  const strings = { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(GraphQLString))) }
  const proposalType = new GraphQLObjectType({
    name: 'VentureIndexedProposal',
    fields: {
      id: text,
      proposer: text,
      description: text,
      targets: strings,
      values: strings,
      calldatas: strings,
    },
  })
  return new GraphQLObjectType({
    name: 'VentureContractIndex',
    fields: {
      pools: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(poolType))) },
      proposals: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(proposalType))) },
      lastBlock: { type: new GraphQLNonNull(GraphQLFloat) },
      blockHash: text,
      hasMore: { type: new GraphQLNonNull(GraphQLBoolean) },
    },
  })
})
