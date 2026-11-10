import * as graphQL from 'graphql'
import { mock } from 'vitest-mock-extended'
import type { GraphQLExtension, PayloadRequest } from 'payload'
import { startupGraphQLMutations } from '@/graphql/startups'

export const createMembershipSchema = () => {
  const startup = new graphQL.GraphQLObjectType({
    name: 'Startup',
    fields: { id: { type: graphQL.GraphQLString }, name: { type: graphQL.GraphQLString } },
  })
  const context = Object.assign(mock<Parameters<GraphQLExtension>[1]>(), {
    Query: { fields: { Startup: { type: startup } } },
  })
  // Payload erases extension field types; the real GraphQL constructor validates these fields.
  const fields = startupGraphQLMutations(graphQL, context) as graphQL.GraphQLFieldConfigMap<
    null,
    { req: PayloadRequest }
  >
  return new graphQL.GraphQLSchema({
    query: new graphQL.GraphQLObjectType({
      name: 'Query',
      fields: { ready: { type: graphQL.GraphQLBoolean } },
    }),
    mutation: new graphQL.GraphQLObjectType({ name: 'Mutation', fields }),
  })
}
