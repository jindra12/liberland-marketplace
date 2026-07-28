import type { Endpoint } from 'payload'
import { getServerSideURL } from '@/utilities/getURL'

export const analyticsConfigEndpoint: Endpoint = {
  path: '/analytics/config',
  method: 'get',
  handler: async () => {
    const baseURL = getServerSideURL()

    return Response.json({
      analytics: {
        anonymousIngest: true,
        apiBaseURL: `${baseURL}/api/analytics`,
        configURL: `${baseURL}/api/analytics/config`,
        graphQLURL: `${baseURL}/api/graphql`,
        mode: 'local',
        storage: 'locallytics',
        trackMutationName: 'trackAnalyticsEvent',
        transport: 'graphql',
      },
    })
  },
}
