import type { GraphQLOutputType } from 'graphql'
import type { GraphQLExtension, PayloadRequest } from 'payload'
import { updateAtomically } from '@/utilities/atomicUpdates/utils'
import { toStringID } from '@/utilities/toStringID'
import type { Startup } from '@/payload-types'

type ExistingGraphQLField = {
  type: GraphQLOutputType
}

type GraphQLContext = {
  req: PayloadRequest
}

type StartupMembershipArgs = {
  id: string
}

type StartupMembershipResult = {
  message: string
  startup: Startup
}

type StartupMembershipAction = 'join' | 'leave'

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

const updateStartupMembership = async (args: {
  action: StartupMembershipAction
  id: string
  req: PayloadRequest
}): Promise<StartupMembershipResult> => {
  await args.req.payload.findByID({
    collection: 'startups',
    id: args.id,
    depth: 0,
    overrideAccess: false,
    req: args.req,
  })
  const userId = String(args.req.user!.id)
  await updateAtomically({
    collection: 'startups',
    id: args.id,
    req: args.req,
    update: (current) => {
      const members = (current.involvedUsers || [])
        .map(toStringID)
        .filter((id): id is string => Boolean(id))
      if (args.action === 'join') {
        return members.includes(userId) ? null : { involvedUsers: [...members, userId] }
      }
      return members.includes(userId)
        ? { involvedUsers: members.filter((id) => id !== userId) }
        : null
    },
  })
  const startup = await args.req.payload.findByID({
    collection: 'startups',
    id: args.id,
    depth: 0,
    overrideAccess: false,
    req: args.req,
  })
  return {
    message: args.action === 'join' ? 'Successfully joined venture.' : 'Successfully left venture.',
    startup,
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
      resolve: async (
        _source: unknown,
        args: StartupMembershipArgs,
        resolverContext: GraphQLContext,
      ) => {
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
      resolve: async (
        _source: unknown,
        args: StartupMembershipArgs,
        resolverContext: GraphQLContext,
      ) => {
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
