import type { GraphQLExtension, PayloadRequest } from 'payload'

import { canCreateContent } from '@/utilities/contentCreation'

const getServerUrl = (): string =>
  process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001'

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
          canCreateContentAsNonAdmin: canCreateContent(context.req.user),
          serverUrl: getServerUrl(),
        },
      ],
      type: new graphQL.GraphQLNonNull(
        new graphQL.GraphQLList(new graphQL.GraphQLNonNull(permissionsType)),
      ),
    },
  }
}
