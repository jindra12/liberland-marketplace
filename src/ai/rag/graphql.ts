import memoize from 'lodash/memoize.js'
import { APIError, type GraphQLExtension, type PayloadRequest } from 'payload'
import { RateLimiterRes } from 'rate-limiter-flexible'
import { z } from 'zod'
import { protectGraphQLRequest } from '@/graphql/utils'
import type { RagSearchRequest } from './types'

const searchInput = z.object({
  query: z.string().min(1).max(600),
  limit: z.number().int().min(1).max(20).optional(),
})
const getGraphQLTypes = memoize((graphQL: Parameters<GraphQLExtension>[0]) => {
  const { GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLString } = graphQL
  const sourceType = new GraphQLObjectType({
    name: 'SemanticSearchSource',
    fields: {
      collection: { type: new GraphQLNonNull(GraphQLString) },
      id: { type: new GraphQLNonNull(GraphQLString) },
      title: { type: new GraphQLNonNull(GraphQLString) },
      slug: { type: GraphQLString },
      serverUrl: { type: new GraphQLNonNull(GraphQLString) },
    },
  })
  const resultType = new GraphQLObjectType({
    name: 'SemanticSearchResult',
    fields: {
      answer: { type: new GraphQLNonNull(GraphQLString) },
      sources: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(sourceType))) },
    },
  })

  return { resultType }
})

export const semanticSearchGraphQLQueries: GraphQLExtension = (graphQL) => {
  const { GraphQLNonNull, GraphQLString, GraphQLInt } = graphQL
  const { resultType } = getGraphQLTypes(graphQL)
  return {
    semanticSearch: {
      type: new GraphQLNonNull(resultType),
      args: {
        query: { type: new GraphQLNonNull(GraphQLString) },
        limit: { type: GraphQLInt },
      },
      resolve: async (_source: null, args: RagSearchRequest, context: { req: PayloadRequest }) => {
        await protectGraphQLRequest(context.req)
        const input = searchInput.parse(args)
        try {
          const { searchRag } = await import('./service')
          return await searchRag(context.req, input)
        } catch (error) {
          if (error instanceof RateLimiterRes) {
            throw new APIError('AI search quota reached. Please retry later.', 429)
          }
          throw error
        }
      },
    },
  }
}
