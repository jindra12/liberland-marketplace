import type { CollectionConfig, Payload, PayloadRequest } from 'payload'
import { adminOnly, isAdminUser } from '@/access/admin'
import { createAuthMiddleware } from 'better-auth/api'
import { z } from 'zod'
import { getCurrentAuthContext } from '@better-auth/core/context'
import { MARKETPLACE_ACCESS_SCOPE } from '@/security/constants'

/** Resolve a live marketplace grant for both authentication and Payload's me hook. */
export const findActiveMarketplaceGrant = async (
  payload: Payload,
  accessToken: string,
  req?: PayloadRequest,
) => {
  const { docs } = await payload.find({
    collection: 'oauthAccessTokens',
    where: { accessToken: { equals: accessToken } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const record = docs[0]
  if (!record?.scopes?.split(' ').includes(MARKETPLACE_ACCESS_SCOPE)) return

  const expiresAt = Date.parse(record.accessTokenExpiresAt || '')
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return

  return { record, expiresAt }
}

/** Browser clients authenticate with PKCE, never a bundled client secret. */
export const getFrontendOIDCClients = () => {
  const clientId = process.env.OIDC_CLIENT_ID
  if (!clientId) return []

  return [
    {
      clientId,
      clientSecret: '',
      name: 'Frontend App',
      type: 'public' as const,
      redirectUrls: (process.env.OIDC_REDIRECT_URLS || '').split(',').filter(Boolean),
      metadata: null,
    },
  ]
}

/** Auth services use Payload's Local API; their stored credentials are not user-facing CRUD. */
export const restrictAuthenticationCollection = (options: {
  collection: CollectionConfig
}): CollectionConfig => ({
  ...options.collection,
  access: {
    ...options.collection.access,
    admin: ({ req }) => isAdminUser(req.user),
    create: adminOnly,
    read: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
})

/** The legacy provider issues a new grant on refresh; retire the consumed grant only on success. */
export const retireExchangedRefreshToken = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== '/oauth2/token' || ctx.body?.grant_type !== 'refresh_token') {
    return
  }
  const issued = z
    .object({ access_token: z.string(), refresh_token: z.string() })
    .safeParse(ctx.context.returned)
  if (!issued.success || issued.data.refresh_token === ctx.body.refresh_token) {
    return
  }
  await ctx.context.adapter.deleteMany({
    model: 'oauthAccessToken',
    where: [{ field: 'refreshToken', value: ctx.body.refresh_token }],
  })
})

export const revokeOAuthGrantsForUser = async (userId: string): Promise<void> => {
  const ctx = await getCurrentAuthContext()
  await ctx.context.adapter.deleteMany({
    model: 'oauthAccessToken',
    where: [{ field: 'userId', value: userId }],
  })
}
