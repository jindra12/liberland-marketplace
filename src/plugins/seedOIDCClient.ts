import type { Config } from 'payload'

/**
 * Seeds the oauthApplications collection with the OIDC trusted client.
 *
 * The better-auth oidcProvider plugin keeps trustedClients in-memory only,
 * but the oauthAccessToken collection has a relationship (FK) to oauthApplications.
 * Without a matching DB record, token creation fails with a BSONError.
 *
 * @see https://github.com/better-auth/better-auth/issues/5468
 */
export const seedOIDCClient = (config: Config): Config => {
  const existingOnInit = config.onInit

  return {
    ...config,
    onInit: async (payload) => {
      if (existingOnInit) await existingOnInit(payload)

      const clientId = process.env.OIDC_CLIENT_ID
      if (!clientId) return

      const existing = await payload.find({
        collection: 'oauthApplications',
        where: { clientId: { equals: clientId } },
        limit: 1,
      })

      if (existing.docs.length > 0) return

      await payload.create({
        collection: 'oauthApplications',
        data: {
          clientId,
          clientSecret: process.env.OIDC_CLIENT_SECRET || '',
          name: 'Frontend App',
          type: 'web',
          redirectUrls: (process.env.OIDC_REDIRECT_URLS || '').split(',').filter(Boolean).join(','),
          metadata: null,
          disabled: false,
        },
      })

      payload.logger.info(`Seeded oauthApplication for OIDC client "${clientId}"`)
    },
  }
}
