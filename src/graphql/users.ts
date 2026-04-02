import type { GraphQLInputType, GraphQLOutputType } from 'graphql'
import type { GraphQLExtension, PayloadRequest } from 'payload'

type ExistingGraphQLArgument = {
  name: string
  type: GraphQLInputType
}

type ExistingGraphQLArgumentConfig = {
  type: GraphQLInputType
}

type ExistingGraphQLField = {
  args?: ExistingGraphQLArgument[] | Record<string, ExistingGraphQLArgumentConfig>
  type: GraphQLOutputType
}

type UserByEmailArgs = {
  email: string
}

type UpdateUserByEmailArgs = {
  data: Record<string, unknown>
  email: string
}

type GraphQLContext = {
  req: PayloadRequest
}

type UserDocument = {
  id: string
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

const getExistingArgType = ({
  argName,
  field,
  fieldName,
}: {
  argName: string
  field: ExistingGraphQLField
  fieldName: string
}): GraphQLInputType => {
  if (Array.isArray(field.args)) {
    const arg = field.args.find((existingArg) => existingArg.name === argName)

    if (!arg) {
      throw new Error(`Missing GraphQL argument "${argName}" on field "${fieldName}"`)
    }

    return arg.type
  }

  const arg = field.args?.[argName]

  if (!arg) {
    throw new Error(`Missing GraphQL argument "${argName}" on field "${fieldName}"`)
  }

  return arg.type
}

const requireAuthorizedUser = ({
  graphQL,
  req,
}: {
  graphQL: Parameters<GraphQLExtension>[0]
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

const findUserByEmail = async ({
  email,
  req,
}: {
  email: string
  req: PayloadRequest
}): Promise<null | UserDocument> => {
  const users = await req.payload.find({
    collection: 'users',
    limit: 1,
    overrideAccess: false,
    req,
    where: {
      email: {
        equals: email,
      },
    },
  })

  return (users.docs[0] as UserDocument | undefined) ?? null
}

export const userGraphQLQueries: GraphQLExtension = (graphQL, context) => {
  const userField = getExistingField({
    fields: context.Query.fields,
    name: 'User',
  })

  return {
    userByEmail: {
      args: {
        email: {
          type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
        },
      },
      resolve: async (_source: unknown, args: UserByEmailArgs, resolverContext: GraphQLContext) => {
        requireAuthorizedUser({
          graphQL,
          req: resolverContext.req,
        })

        return findUserByEmail({
          email: args.email,
          req: resolverContext.req,
        })
      },
      type: userField.type,
    },
  }
}

export const userGraphQLMutations: GraphQLExtension = (graphQL, context) => {
  const updateUserField = getExistingField({
    fields: context.Mutation.fields,
    name: 'updateUser',
  })
  const updateUserDataArgType = getExistingArgType({
    argName: 'data',
    field: updateUserField,
    fieldName: 'updateUser',
  })

  return {
    updateUserByEmail: {
      args: {
        data: {
          type: updateUserDataArgType,
        },
        email: {
          type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
        },
      },
      resolve: async (
        _source: unknown,
        args: UpdateUserByEmailArgs,
        resolverContext: GraphQLContext,
      ) => {
        requireAuthorizedUser({
          graphQL,
          req: resolverContext.req,
        })

        const user = await findUserByEmail({
          email: args.email,
          req: resolverContext.req,
        })

        if (!user) {
          throw new graphQL.GraphQLError('User not found.', {
            extensions: {
              code: 'NOT_FOUND',
            },
          })
        }

        return resolverContext.req.payload.update({
          collection: 'users',
          data: args.data,
          id: user.id,
          overrideAccess: false,
          req: resolverContext.req,
        })
      },
      type: updateUserField.type,
    },
  }
}
