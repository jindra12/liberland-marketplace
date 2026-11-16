import type { GraphQLExtension, PayloadRequest } from 'payload'
import { issueCompanyPaymentSecret, readCompanyPaymentSettings } from '@/payments/integration'

export const companyPaymentGraphQLQueries: GraphQLExtension = (graphQL) => ({
  companyPaymentSettings: {
    type: new graphQL.GraphQLObjectType({
      name: 'CompanyPaymentSettings',
      fields: {
        companyId: { type: new graphQL.GraphQLNonNull(graphQL.GraphQLString) },
        paymentWebhookUrl: { type: graphQL.GraphQLString },
        hasWebhookSecret: { type: new graphQL.GraphQLNonNull(graphQL.GraphQLBoolean) },
      },
    }),
    args: { companyId: { type: new graphQL.GraphQLNonNull(graphQL.GraphQLString) } },
    resolve: (_source: null, args: { companyId: string }, context: { req: PayloadRequest }) =>
      readCompanyPaymentSettings(context.req, args.companyId),
  },
})

export const companyPaymentGraphQLMutations: GraphQLExtension = (graphQL) => {
  const result = new graphQL.GraphQLObjectType({
    name: 'IssuedCompanyPaymentSecret',
    fields: {
      companyId: { type: new graphQL.GraphQLNonNull(graphQL.GraphQLString) },
      secret: { type: new graphQL.GraphQLNonNull(graphQL.GraphQLString) },
    },
  })
  const issue = (action: 'generate' | 'rotate') => ({
    type: result,
    args: { companyId: { type: new graphQL.GraphQLNonNull(graphQL.GraphQLString) } },
    resolve: (_source: null, args: { companyId: string }, context: { req: PayloadRequest }) =>
      issueCompanyPaymentSecret(context.req, args.companyId, action),
  })
  return {
    generateCompanyPaymentSecret: issue('generate'),
    rotateCompanyPaymentSecret: issue('rotate'),
  }
}
