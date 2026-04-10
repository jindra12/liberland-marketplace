import type { GraphQLOutputType } from 'graphql'
import type { GraphQLExtension, PayloadRequest } from 'payload'

type ExistingGraphQLField = {
  type: GraphQLOutputType
}

type GraphQLContext = {
  req: PayloadRequest
}

type StartupMembershipArgs = {
  id: string
}

type StartupDocument = {
  involvedUsers?: unknown
}

type StartupMembershipResult = {
  message: string
  startup: unknown
}

type StartupMembershipAction = 'join' | 'leave'

const toId = (value: unknown): null | string => {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)

  if (value && typeof value === 'object') {
    const id = (value as { id?: unknown }).id

    if (typeof id === 'string') return id
    if (typeof id === 'number') return String(id)
  }

  return null
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

const requireAuthorizedUser = ({
  graphQL,
  req,
}: {
  graphQL: Parameters<GraphQLExtension>[0]
  req: PayloadRequest
}) => {
  if (!req.user) {
    throw new graphQL.GraphQLError('You must be logged in.', {
      extensions: {
        code: 'UNAUTHORIZED',
      },
    })
  }
}

const updateStartupMembership = async ({
  action,
  id,
  req,
}: {
  action: StartupMembershipAction
  id: string
  req: PayloadRequest
}): Promise<StartupMembershipResult> => {
  const userId = String(req.user?.id)
  const startup = (await req.payload.findByID({
    collection: 'startups',
    depth: 0,
    id,
    overrideAccess: true,
    req,
  })) as StartupDocument

  const currentIds = ((startup.involvedUsers as unknown[]) ?? []).map(toId).filter(Boolean) as string[]

  if (action === 'join') {
    if (currentIds.includes(userId)) {
      return {
        message: 'You are already involved in this venture.',
        startup,
      }
    }

    const updatedStartup = await req.payload.update({
      collection: 'startups',
      data: {
        involvedUsers: [...currentIds, userId],
      },
      id,
      overrideAccess: true,
      req,
    })

    return {
      message: 'Successfully joined venture.',
      startup: updatedStartup,
    }
  }

  if (!currentIds.includes(userId)) {
    return {
      message: 'You are not involved in this venture.',
      startup,
    }
  }

  const updatedStartup = await req.payload.update({
    collection: 'startups',
    data: {
      involvedUsers: currentIds.filter((currentId) => currentId !== userId),
    },
    id,
    overrideAccess: true,
    req,
  })

  return {
    message: 'Successfully left venture.',
    startup: updatedStartup,
  }
}

export const startupGraphQLMutations: GraphQLExtension = (graphQL, context) => {
  const startupField = getExistingField({
    fields: context.Query.fields,
    name: 'Startup',
  })

  const startupMembershipResultType = new graphQL.GraphQLObjectType({
    fields: {
      message: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
      startup: {
        type: startupField.type,
      },
    },
    name: 'StartupMembershipResult',
  })

  const membershipArgs = {
    id: {
      type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
    },
  }

  return {
    joinStartup: {
      args: membershipArgs,
      resolve: async (_source: unknown, args: StartupMembershipArgs, resolverContext: GraphQLContext) => {
        requireAuthorizedUser({
          graphQL,
          req: resolverContext.req,
        })

        return updateStartupMembership({
          action: 'join',
          id: args.id,
          req: resolverContext.req,
        })
      },
      type: new graphQL.GraphQLNonNull(startupMembershipResultType),
    },
    leaveStartup: {
      args: membershipArgs,
      resolve: async (_source: unknown, args: StartupMembershipArgs, resolverContext: GraphQLContext) => {
        requireAuthorizedUser({
          graphQL,
          req: resolverContext.req,
        })

        return updateStartupMembership({
          action: 'leave',
          id: args.id,
          req: resolverContext.req,
        })
      },
      type: new graphQL.GraphQLNonNull(startupMembershipResultType),
    },
  }
}
