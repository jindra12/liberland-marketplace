import type { Config } from 'payload'
import { getFrontendOIDCClients } from './utils'

/**
 * Reconciles the browser's public PKCE registration without changing its ID.
 *
 * The provider's trusted-client configuration does not update stored clients.
 * Repair the existing record in place so its identity and grants are preserved.
 */
export const seedOIDCClient = (config: Config): Config => {
  const existingOnInit = config.onInit

  return {
    ...config,
    onInit: async (payload) => {
      if (existingOnInit) await existingOnInit(payload)

      const [client] = getFrontendOIDCClients()
      if (!client) return

      const existing = await payload.find({
        collection: 'oauthApplications',
        where: { clientId: { equals: client.clientId } },
        limit: 1,
      })

      const redirectUrls = client.redirectUrls.join(',')
      const existingClient = existing.docs[0]
      if (existingClient) {
        if (
          existingClient.type !== client.type ||
          existingClient.clientSecret ||
          existingClient.redirectUrls !== redirectUrls
        ) {
          await payload.update({
            collection: 'oauthApplications',
            id: existingClient.id,
            data: { type: client.type, clientSecret: '', redirectUrls },
          })
          payload.logger.info('Updated frontend OAuth registration to public PKCE')
        }
        return
      }

      await payload.create({
        collection: 'oauthApplications',
        data: {
          ...client,
          redirectUrls,
          disabled: false,
        },
      })

      payload.logger.info('Created frontend OAuth registration with public PKCE')
    },
  }
}
