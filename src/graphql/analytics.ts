import type { GraphQLExtension, PayloadRequest } from 'payload'
import {
  analyticsTrackInputSchema,
  trackAnalyticsRequest,
} from '@/utilities/analytics/tracking'

type AnalyticsTrackMutationArgs = {
  input: unknown
}

type AnalyticsTrackMutationContext = {
  req: PayloadRequest
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseMetadataValue = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error('Analytics metadata must be a JSON object.')
  }

  return value
}

export const analyticsGraphQLMutations: GraphQLExtension = (graphQL) => {
  const metadataScalar = new graphQL.GraphQLScalarType({
    description: 'Analytics metadata as a JSON object.',
    name: 'AnalyticsMetadata',
    parseLiteral(ast, variables) {
      return parseMetadataValue(graphQL.valueFromASTUntyped(ast, variables))
    },
    parseValue(value) {
      return parseMetadataValue(value)
    },
    serialize(value) {
      return parseMetadataValue(value)
    },
  })

  const analyticsTrackInputType = new graphQL.GraphQLInputObjectType({
    fields: {
      distinctId: {
        type: graphQL.GraphQLString,
      },
      metadata: {
        defaultValue: {},
        type: metadataScalar,
      },
      route: {
        type: graphQL.GraphQLString,
      },
      sessionId: {
        type: graphQL.GraphQLString,
      },
      type: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
    },
    name: 'AnalyticsTrackInput',
  })

  const analyticsTrackIdentifiersType = new graphQL.GraphQLObjectType({
    fields: {
      distinctId: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
      eventId: {
        type: graphQL.GraphQLString,
      },
      sessionId: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLString),
      },
    },
    name: 'AnalyticsTrackIdentifiers',
  })

  const analyticsTrackResultType = new graphQL.GraphQLObjectType({
    fields: {
      analytics: {
        type: new graphQL.GraphQLNonNull(analyticsTrackIdentifiersType),
      },
      success: {
        type: new graphQL.GraphQLNonNull(graphQL.GraphQLBoolean),
      },
    },
    name: 'AnalyticsTrackResult',
  })

  return {
    trackAnalyticsEvent: {
      args: {
        input: {
          type: new graphQL.GraphQLNonNull(analyticsTrackInputType),
        },
      },
      resolve: async (
        _source: unknown,
        args: AnalyticsTrackMutationArgs,
        context: AnalyticsTrackMutationContext,
      ) => {
        const parsed = analyticsTrackInputSchema.safeParse(args.input)

        if (!parsed.success) {
          throw new graphQL.GraphQLError('Invalid analytics payload.', {
            extensions: {
              issues: parsed.error.flatten(),
            },
          })
        }

        try {
          return await trackAnalyticsRequest({
            input: parsed.data,
            req: context.req,
          })
        } catch {
          throw new graphQL.GraphQLError('Analytics is temporarily unavailable.', {
            extensions: {
              code: 'SERVICE_UNAVAILABLE',
            },
          })
        }
      },
      type: new graphQL.GraphQLNonNull(analyticsTrackResultType),
    },
  }
}
