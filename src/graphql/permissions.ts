import type { GraphQLExtension, PayloadRequest } from 'payload'

import { getServerSideURL } from '@/utilities/getURL'

export const permissionsGraphQLQueries: GraphQLExtension = (graphQL) => {
  const permissionsType = new graphQL.GraphQLObjectType({
    name: 'Permissions',
    fields: {
      canCreateContentAsNonAdmin: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLBoolean),
      },
      serverUrl: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
    },
  })

  return {
    permissions: {
      resolve: (_source: unknown, _args: unknown, context: { req: PayloadRequest }) => [
        {
          canCreateContentAsNonAdmin: Boolean(context.req.user),
          serverUrl: getServerSideURL(),
        },
      ],
      type: new graphQL.GraphQLNonNull(
        new graphQL.GraphQLList(new graphQL.GraphQLNonNull(permissionsType)),
      ),
    },
  }
}
