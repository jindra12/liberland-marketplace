import memoize from 'lodash/memoize.js'
import { GraphQLJSON } from '@payloadcms/graphql/types'
import type { GraphQLExtension, PayloadRequest } from 'payload'
import type { z } from 'zod'
import { protectGraphQLRequest } from './utils'
import { getVentureIndexType } from './ventureIndexTypes'
import { accessVentureRecovery } from '@/venture/recoveryService'
import { getVentureIndex } from '@/venture/marketService'
import type { recoveryActionSchema, recoveryRecordSchema } from '@/venture/recoveryUtils'

const getGraphQLTypes = memoize((graphQL: Parameters<GraphQLExtension>[0]) => {
  const {
    GraphQLNonNull,
    GraphQLString,
    GraphQLFloat,
    GraphQLBoolean,
    GraphQLObjectType,
    GraphQLInputObjectType,
    GraphQLList,
  } = graphQL
  const requiredString = { type: new GraphQLNonNull(GraphQLString) }
  const stepFields = {
    label: requiredString,
    hash: requiredString,
    nonce: { type: GraphQLFloat },
    chainId: { type: GraphQLString },
    submittedAtBlock: { type: GraphQLFloat },
  }
  const valuesFields = {
    tokenName: requiredString,
    tokenSymbol: requiredString,
    initialSupply: requiredString,
    tokensPerEth: requiredString,
    deploymentNetwork: requiredString,
    acknowledged: { type: new GraphQLNonNull(GraphQLBoolean) },
  }
  const recordFields = {
    manifest: { type: GraphQLJSON },
    saved: { type: GraphQLBoolean },
    runnerId: { type: GraphQLString },
  }
  const stepType = new GraphQLObjectType({ name: 'VentureDeploymentStep', fields: stepFields })
  const stepInput = new GraphQLInputObjectType({
    name: 'VentureDeploymentStepInput',
    fields: stepFields,
  })
  const valuesType = new GraphQLObjectType({
    name: 'VentureDeploymentValues',
    fields: valuesFields,
  })
  const valuesInput = new GraphQLInputObjectType({
    name: 'VentureDeploymentValuesInput',
    fields: valuesFields,
  })
  const recoveryType = new GraphQLObjectType({
    name: 'VentureDeploymentRecoveryRecord',
    fields: {
      ...recordFields,
      values: { type: new GraphQLNonNull(valuesType) },
      transactions: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(stepType))) },
      progress: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(stepType))) },
    },
  })
  const recoveryInput = new GraphQLInputObjectType({
    name: 'VentureDeploymentRecoveryInput',
    fields: {
      ...recordFields,
      values: { type: new GraphQLNonNull(valuesInput) },
      transactions: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(stepInput))) },
      progress: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(stepInput))) },
    },
  })
  const identityArgs = { ventureId: requiredString, walletAddress: requiredString }
  return { requiredString, identityArgs, recoveryType, recoveryInput }
})

type RecoveryArgs = { ventureId: string; walletAddress: string }
type Context = { req: PayloadRequest }

export const ventureContractGraphQLQueries: GraphQLExtension = (graphQL) => {
  const { GraphQLNonNull } = graphQL
  const { requiredString, identityArgs, recoveryType } = getGraphQLTypes(graphQL)
  return {
    ventureContractIndex: {
      type: new GraphQLNonNull(getVentureIndexType(graphQL)),
      args: { ventureId: requiredString, deploymentId: requiredString },
      resolve: async (
        _source: null,
        args: { ventureId: string; deploymentId: string },
        context: Context,
      ) => {
        await protectGraphQLRequest(context.req)
        return getVentureIndex(context.req, args.ventureId, args.deploymentId)
      },
    },
    ventureRecoveryRecord: {
      type: recoveryType,
      args: identityArgs,
      resolve: async (_source: null, args: RecoveryArgs, context: Context) => {
        await protectGraphQLRequest(context.req)
        return accessVentureRecovery(context.req, args.ventureId, args.walletAddress, 'get')
      },
    },
  }
}

export const ventureContractGraphQLMutations: GraphQLExtension = (graphQL) => {
  const { GraphQLNonNull, GraphQLBoolean } = graphQL
  const { requiredString, identityArgs, recoveryType, recoveryInput } = getGraphQLTypes(graphQL)
  return {
    saveVentureDeploymentRecovery: {
      type: new GraphQLNonNull(recoveryType),
      args: { ...identityArgs, record: { type: new GraphQLNonNull(recoveryInput) } },
      resolve: async (
        _source: null,
        args: RecoveryArgs & { record: z.input<typeof recoveryRecordSchema> },
        context: Context,
      ) => {
        await protectGraphQLRequest(context.req)
        return accessVentureRecovery(
          context.req,
          args.ventureId,
          args.walletAddress,
          'put',
          args.record,
        )
      },
    },
    deleteVentureDeploymentRecovery: {
      type: GraphQLBoolean,
      args: identityArgs,
      resolve: async (_source: null, args: RecoveryArgs, context: Context) => {
        await protectGraphQLRequest(context.req)
        await accessVentureRecovery(context.req, args.ventureId, args.walletAddress, 'delete')
        return true
      },
    },
    reconcileVentureDeploymentRecovery: {
      type: recoveryType,
      args: {
        ...identityArgs,
        record: { type: new GraphQLNonNull(recoveryInput) },
        action: requiredString,
        runnerId: requiredString,
        confirmed: { type: new GraphQLNonNull(GraphQLBoolean) },
      },
      resolve: async (
        _source: null,
        args: RecoveryArgs & z.input<typeof recoveryActionSchema>,
        context: Context,
      ) => {
        await protectGraphQLRequest(context.req)
        return accessVentureRecovery(context.req, args.ventureId, args.walletAddress, 'post', args)
      },
    },
  }
}
