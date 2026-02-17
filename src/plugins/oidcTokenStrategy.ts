import type { AuthStrategy, CollectionConfig, Config } from 'payload'

/**
 * Payload auth strategy that validates OIDC access tokens from the Authorization header.
 *
 * The better-auth oidcProvider issues opaque access tokens stored in the
 * oauthAccessTokens collection. This strategy lets frontends authenticate
 * Payload API requests with `Authorization: Bearer <oidc-access-token>`.
 */
const oidcAccessTokenStrategy: AuthStrategy = {
  name: 'oidc-access-token',
  authenticate: async ({ headers, payload }) => {
    const auth = headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return { user: null }

    const token = auth.slice(7)
    if (!token) return { user: null }

    try {
      const { docs } = await payload.find({
        collection: 'oauthAccessTokens',
        where: { accessToken: { equals: token } },
        limit: 1,
        depth: 0,
      })

      const record = docs[0]
      if (!record) return { user: null }

      if (record.accessTokenExpiresAt && new Date(record.accessTokenExpiresAt) < new Date()) {
        return { user: null }
      }

      const userId = typeof record.user === 'string' ? record.user : record.user?.id
      if (!userId) return { user: null }

      const user = await payload.findByID({ collection: 'users', id: userId })
      if (!user) return { user: null }

      return {
        user: {
          ...user,
          collection: 'users',
          _strategy: 'oidc-access-token',
        },
      }
    } catch {
      return { user: null }
    }
  },
}

/**
 * Appends the OIDC access-token auth strategy to the Users collection.
 * Must run after betterAuthPlugin so the existing strategies array exists.
 */
export const addOIDCTokenStrategy = (config: Config): Config => ({
  ...config,
  collections: (config.collections ?? []).map((collection: CollectionConfig) => {
    if (collection.slug !== 'users') return collection

    const existingAuth = typeof collection.auth === 'object' ? collection.auth : {}
    const existingStrategies = existingAuth.strategies ?? []

    return {
      ...collection,
      auth: {
        ...existingAuth,
        strategies: [...existingStrategies, oidcAccessTokenStrategy],
      },
    }
  }),
})
