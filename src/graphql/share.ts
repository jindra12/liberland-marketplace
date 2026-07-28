import type { GraphQLExtension, PayloadRequest } from 'payload'

import { createShareRepost } from '@/app/api/share/service'
import { ShareApiError } from '@/app/api/share/utils'
import type { ShareUser } from '@/app/api/share/utils'

type ExistingGraphQLField = {
  type: import('graphql').GraphQLOutputType
}

type GraphQLContext = {
  req: PayloadRequest
}

const getExistingField = ({
  fields,
  name,
}: {
  fields: Record<string, unknown>
  name: string
}): ExistingGraphQLField => {
  const field = fields[name]

  if (!field || typeof field !== 'object' || !('type' in field)) {
    throw new Error(`Missing GraphQL field: ${name}`)
  }

  return field as ExistingGraphQLField
}

const shareGraphQLError = (
  graphQL: Parameters<GraphQLExtension>[0],
  error: ShareApiError,
): Error => {
  const code =
    error.status === 401
      ? 'UNAUTHORIZED'
      : error.status === 403
        ? 'FORBIDDEN'
        : error.status === 404
          ? 'NOT_FOUND'
          : 'BAD_REQUEST'

  return new graphQL.GraphQLError(error.message, {
    extensions: {
      code,
      status: error.status,
    },
  })
}

export const shareGraphQLMutations: GraphQLExtension = (graphQL, context) => {
  const companyField = getExistingField({
    fields: context.Query.fields,
    name: 'Company',
  })
  const postField = getExistingField({
    fields: context.Query.fields,
    name: 'Post',
  })

  const shareInputType = new graphQL.GraphQLInputObjectType({
    fields: {
      companyId: {
        type: graphQL.GraphQLString,
      },
      description: {
        type: graphQL.GraphQLString,
      },
      link: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
    },
    name: 'ShareRepostInput',
  })

  const shareSourceType = new graphQL.GraphQLObjectType({
    fields: {
      description: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
      imageURL: {
        type: graphQL.GraphQLString,
      },
      isSinglePageApp: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLBoolean),
      },
      link: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
      title: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
    },
    name: 'ShareRepostSource',
  })

  const shareResultType = new graphQL.GraphQLObjectType({
    fields: {
      company: {
        type: companyField.type,
      },
      post: {
        type: postField.type,
      },
      source: {
        type: new graphQL.GraphQLNonNull(shareSourceType),
      },
    },
    name: 'ShareRepostResult',
  })

  return {
    shareRepost: {
      args: {
        input: {
          type: new graphQL.GraphQLNonNull(shareInputType),
        },
      },
      resolve: async (
        _source: unknown,
        args: { input: { companyId?: string | null; description?: string | null; link: string } },
        resolverContext: GraphQLContext,
      ) => {
        if (!resolverContext.req.user) {
          throw new graphQL.GraphQLError('Unauthorized.', {
            extensions: {
              code: 'UNAUTHORIZED',
            },
          })
        }

        try {
          return await createShareRepost({
            companyId: args.input.companyId ?? null,
            description: args.input.description ?? null,
            link: args.input.link,
            payload: resolverContext.req.payload,
            user: resolverContext.req.user as ShareUser,
            req: resolverContext.req,
          })
        } catch (error) {
          if (error instanceof ShareApiError) {
            throw shareGraphQLError(graphQL, error)
          }

          throw error
        }
      },
      type: new graphQL.GraphQLNonNull(shareResultType),
    },
  }
}
