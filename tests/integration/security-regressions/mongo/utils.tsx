import { randomUUID } from 'node:crypto'
import { OAUTH_SCOPES } from '@/security/constants'
import { getPayloadAuth } from 'payload-auth/better-auth'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, expect, vi } from 'vitest'
import type {
  CollectionAfterReadHook,
  CollectionSlug,
  GraphQLExtension,
  PayloadRequest,
} from 'payload'
import * as graphQL from 'graphql'
import { mock } from 'vitest-mock-extended'
import { sellerOrderGraphQLMutations } from '@/graphql/sellerOrders'
import { verifyAuthenticationMailbox } from '../../../unit/security-regressions/authentication/utils'

export const createMongoSecurityFixture = async () => {
  const database = await MongoMemoryServer.create({
    binary: { systemBinary: '/usr/bin/mongod', version: '8.0.34' },
    instance: { dbName: 'security_regressions', args: ['--wiredTigerCacheSizeGB', '0.25'] },
  })
  const runtime: { payload?: Awaited<ReturnType<typeof getPayloadAuth>> } = {}
  afterAll(async () => {
    try {
      await runtime.payload?.destroy()
    } finally {
      await database.stop()
      vi.unstubAllEnvs()
    }
  })
  vi.stubEnv('DATABASE_URL', database.getUri())
  vi.stubEnv('PAYLOAD_SECRET', 'disposable-security-test-payload-secret')
  vi.stubEnv('BETTER_AUTH_SECRET', 'disposable-security-test-auth-secret')
  vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://backend.example')
  vi.stubEnv('NEXT_PUBLIC_FRONTEND_URL', 'https://frontend.example')
  vi.stubEnv('OIDC_REDIRECT_URLS', 'https://frontend.example')
  const config = await (await import('@/payload.config')).default
  runtime.payload = await getPayloadAuth(config)
  return runtime.payload
}

// Hold two genuine database reads at the same snapshot; writes still use real Payload/Mongo.
export const synchronizeMongoReads = (
  payload: Awaited<ReturnType<typeof getPayloadAuth>>,
  collection: CollectionSlug,
  id: string,
) => {
  const release = vi.fn<() => void>()
  const gate = new Promise<void>((resolve) => release.mockImplementation(resolve))
  const arrivals = { count: 0 }
  const hooks = payload.collections[collection].config.hooks
  const original = hooks.afterRead
  const synchronize: CollectionAfterReadHook = async ({ doc }) => {
    if (doc.id === id && arrivals.count < 2) {
      arrivals.count += 1
      if (arrivals.count === 2) {
        release()
      }
      await gate
    }
    return doc
  }
  hooks.afterRead = [...original, synchronize]
  return () => {
    release()
    hooks.afterRead = original
  }
}

/** Both conditional writes reach Mongo with the same previously-read snapshot. */
export const synchronizeMongoWrites = (
  payload: Awaited<ReturnType<typeof getPayloadAuth>>,
  collection: CollectionSlug,
  id: string,
) => {
  const release = vi.fn<() => void>()
  const gate = new Promise<void>((resolve) => release.mockImplementation(resolve))
  const arrivals = { count: 0 }
  const update = payload.db.updateOne.bind(payload.db)
  const spy = vi.spyOn(payload.db, 'updateOne').mockImplementation(async (args) => {
    if (args.collection === collection && (String(args.id) === id || JSON.stringify(args.where).includes(id)) && arrivals.count < 2) {
      arrivals.count += 1
      if (arrivals.count === 2) {
        release()
      }
      await gate
    }
    return update(args)
  })
  return () => {
    release()
    spy.mockRestore()
    expect(arrivals.count, 'Both writers must reach the conditional database write').toBe(2)
  }
}

export const createPersistedFulfillmentSchema = () => {
  const product = new graphQL.GraphQLObjectType({
    name: 'Product',
    fields: { id: { type: graphQL.GraphQLString } },
  })
  const context = Object.assign(mock<Parameters<GraphQLExtension>[1]>(), {
    Query: { fields: { Product: { type: product } } },
  })
  // Payload's extension API erases field types; the GraphQL constructor validates this real resolver map.
  const fields = sellerOrderGraphQLMutations(graphQL, context) as graphQL.GraphQLFieldConfigMap<
    null,
    { req: PayloadRequest }
  >
  return new graphQL.GraphQLSchema({
    query: new graphQL.GraphQLObjectType({
      name: 'Query',
      fields: { ready: { type: graphQL.GraphQLBoolean } },
    }),
    mutation: new graphQL.GraphQLObjectType({ name: 'Mutation', fields }),
  })
}

export const registerMongoOAuthGrant = async (
  payload: Awaited<ReturnType<typeof getPayloadAuth>>,
) => {
  const key = randomUUID()
  const response = await payload.betterAuth.handler(
    new Request('https://backend.example/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://backend.example' },
      body: JSON.stringify({
        name: 'OAuth fixture',
        email: `${key}@example.test`,
        password: 'fixture-password-123456',
      }),
    }),
  )
  if (!response.ok) {
    throw new Error(`Disposable signup failed: ${response.status} ${await response.text()}`)
  }
  const account: { user: { id: string } } = await response.json()
  const context = await payload.betterAuth.$context
  const clientId = `fixture-${key}`
  const accessToken = `access-${key}`
  const refreshToken = `refresh-${key}`
  await context.adapter.create({
    model: 'oauthApplication',
    data: {
      name: 'OAuth fixture',
      clientId,
      clientSecret: 'fixture-secret',
      type: 'web',
      disabled: false,
      redirectUrls: 'https://client.example/callback',
    },
  })
  await context.adapter.create({
    model: 'oauthAccessToken',
    data: {
      userId: account.user.id,
      clientId,
      accessToken,
      refreshToken,
      accessTokenExpiresAt: new Date(Date.now() + 3600000),
      refreshTokenExpiresAt: new Date(Date.now() + 86400000),
      scopes: OAUTH_SCOPES.join(' '),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  })
  const verified = await verifyAuthenticationMailbox(payload.betterAuth, `${key}@example.test`)
  const cookie = verified.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
  return { context, clientId, accessToken, refreshToken, userId: account.user.id, cookie }
}
