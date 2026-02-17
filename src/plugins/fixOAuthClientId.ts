import type { CollectionBeforeValidateHook, CollectionConfig, Config } from 'payload'

/**
 * Fixes the clientId reference mismatch between better-auth and Payload.
 *
 * better-auth's OIDC provider passes `clientId: "frontend-app"` (the actual
 * client ID string) when creating oauthAccessToken / oauthConsent records.
 * But payload-auth maps `clientId` as a Payload relationship field (which
 * expects a MongoDB ObjectId). This hook resolves the string clientId to
 * the ObjectId of the matching oauthApplication before validation runs.
 */
const resolveClientId: CollectionBeforeValidateHook = async ({ data, req }) => {
  // The payload-auth adapter renames "clientId" to "client" (the relationship field name)
  const clientValue = data?.client ?? data?.clientId
  if (!clientValue) return data

  const clientStr = String(clientValue)

  // Already a valid ObjectId (24-char hex) — nothing to fix
  if (/^[a-f\d]{24}$/i.test(clientStr)) return data

  const { docs } = await req.payload.find({
    collection: 'oauthApplications',
    where: { clientId: { equals: clientStr } },
    limit: 1,
    depth: 0,
    req,
  })

  if (!docs[0]) return data

  const fieldName = data?.client !== undefined ? 'client' : 'clientId'
  return { ...data, [fieldName]: docs[0].id }
}

const OAUTH_COLLECTIONS_WITH_CLIENT_ID = ['oauthAccessTokens', 'oauthConsents']

/**
 * Plugin that adds the clientId resolution hook to OAuth collections.
 * Must run after betterAuthPlugin so the collections exist.
 */
export const fixOAuthClientId = (config: Config): Config => ({
  ...config,
  collections: (config.collections ?? []).map((collection: CollectionConfig) => {
    if (!OAUTH_COLLECTIONS_WITH_CLIENT_ID.includes(collection.slug)) return collection

    return {
      ...collection,
      hooks: {
        ...collection.hooks,
        beforeValidate: [...(collection.hooks?.beforeValidate ?? []), resolveClientId],
      },
    }
  }),
})
