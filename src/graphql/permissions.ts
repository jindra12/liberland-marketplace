import type { GraphQLExtension } from 'payload'

import { canNonAdminCreateContent } from '@/utilities/contentCreation'

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
      resolve: () => [
        {
          canCreateContentAsNonAdmin: canNonAdminCreateContent(),
          serverUrl: getServerUrl(),
        },
      ],
      type: new graphQL.GraphQLNonNull(
        new graphQL.GraphQLList(new graphQL.GraphQLNonNull(permissionsType)),
      ),
    },
  }
}
