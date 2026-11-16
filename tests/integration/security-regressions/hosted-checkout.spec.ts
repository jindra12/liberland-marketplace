import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { createLocalReq } from 'payload'
import { guardedFetch } from 'guarded-fetch'
import { configToSchema } from '@payloadcms/graphql'
import { graphql } from 'graphql/index.js'
import stringify from 'fast-json-stable-stringify'
import { createMongoSecurityFixture, synchronizeMongoWrites } from './mongo/utils'
import { providerEvent, providerRequest } from './hostedPayments/utils'
import {
  acceptThirdwebPayment,
  createCheckoutSession,
  findCheckoutSession,
  publicCheckoutSession,
} from '@/payments/service'
import { signPaymentBody } from '@/payments/utils'
import { getPaymentWebhookSecret, issueCompanyPaymentSecret } from '@/payments/integration'

vi.mock('@/utilities/sendAuthEmail', () => ({ sendAuthEmail: vi.fn() }))
vi.mock('@payloadcms/email-nodemailer', () => ({
  nodemailerAdapter: async () => () => ({
    name: 'fixture',
    defaultFromAddress: 'test@example.test',
    defaultFromName: 'Fixture',
    sendEmail: vi.fn(),
  }),
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('guarded-fetch', async (original) => ({
  ...(await original<typeof import('guarded-fetch')>()),
  guardedFetch: vi.fn(),
}))

const payload = await createMongoSecurityFixture()
const { schema } = configToSchema(payload.config)
const ownerId = new Types.ObjectId()
const otherUserId = new Types.ObjectId()
const adminId = new Types.ObjectId()
const companyId = new Types.ObjectId()
const identityId = new Types.ObjectId()
const productId = new Types.ObjectId()
const wallet = `0x${'1'.repeat(40)}`

beforeEach(async () => {
  vi.stubEnv('THIRDWEB_CLIENT_ID', 'test-project')
  vi.stubEnv('THIRDWEB_WEBHOOK_SECRET', 'test-provider-secret')
  vi.mocked(guardedFetch).mockResolvedValue(new Response(null, { status: 204 }))
  await payload.db.collections.identities.collection.insertOne({
    _id: identityId,
    name: 'Merchant tribe',
    _status: 'published',
  })
  await payload.db.collections.users.collection.insertOne({
    _id: ownerId,
    email: 'owner@example.test',
    name: 'Owner',
    role: ['user'],
    emailVerified: true,
  })
  await payload.db.collections.users.collection.insertMany([
    {
      _id: otherUserId,
      email: 'other@example.test',
      name: 'Other',
      role: ['user'],
      emailVerified: true,
    },
    {
      _id: adminId,
      email: 'admin@example.test',
      name: 'Admin',
      role: ['admin'],
      emailVerified: true,
    },
  ])
  await payload.db.collections.companies.collection.insertOne({
    _id: companyId,
    identity: identityId,
    name: 'Merchant',
    createdBy: ownerId,
    _status: 'published',
    isPrivate: false,
    acceptThirdwebDonations: true,
    cryptoAddresses: { chain: 'ethereum', address: wallet },
    paymentWebhookUrl: 'https://merchant.example/payments',
    paymentWebhookSecret: 'merchant-secret',
  })
  await payload.db.collections.products.collection.insertOne({
    _id: productId,
    company: companyId,
    name: 'Service',
    _status: 'published',
    orderable: true,
    priceInUSDEnabled: true,
    priceInUSD: 500,
  })
})

afterEach(async () => {
  await Promise.all(
    [
      'users',
      'identities',
      'companies',
      'products',
      'checkout-sessions',
      'payload-jobs',
      'payment-webhook-credentials',
    ].map((name) => payload.db.collections[name].deleteMany({})),
  )
  await Promise.all(Object.values(payload.db.versions).map((model) => model.deleteMany({})))
})

describe('Hosted merchant checkout integrity', () => {
  it.each([false, undefined])(
    'rejects donations without opt-in (%s), but still permits product payments',
    async (enabled) => {
      await payload.db.collections.companies.updateOne(
        { _id: companyId },
        enabled === undefined
          ? { $unset: { acceptThirdwebDonations: 1 } }
          : { $set: { acceptThirdwebDonations: enabled } },
      )
      const req = await createLocalReq({}, payload)
      await expect(
        createCheckoutSession(
          req,
          JSON.stringify({
            companyId: String(companyId),
            amountUsdCents: 1000,
          }),
        ),
      ).rejects.toMatchObject({
        status: 400,
        message: 'This company is not accepting Thirdweb donations.',
      })
      expect((await payload.count({ collection: 'checkout-sessions' })).totalDocs).toBe(0)
      const session = await createCheckoutSession(
        req,
        JSON.stringify({
          companyId: String(companyId),
          productId: String(productId),
        }),
      )
      expect(session.amountUsdCents).toBe(500)
    },
  )

  it('publishes the donation opt-in through the public company query', async () => {
    const req = await createLocalReq({}, payload)
    const result = await graphql({
      schema,
      source:
        'query DonationCompany($id: String!) { Company(id: $id) { id acceptThirdwebDonations canAcceptThirdwebDonations paymentWebhookUrl paymentWebhookSecret } }',
      variableValues: { id: String(companyId) },
      contextValue: { req },
    })
    expect(result.errors).toBeUndefined()
    expect(result.data?.Company).toMatchObject({
      id: String(companyId),
      acceptThirdwebDonations: true,
      canAcceptThirdwebDonations: true,
      paymentWebhookUrl: null,
      paymentWebhookSecret: null,
    })
  })

  it.each([
    { cryptoAddresses: null },
    { cryptoAddresses: {} },
    { cryptoAddresses: { chain: 'ethereum', address: '' } },
    { cryptoAddresses: { chain: 'solana', address: wallet } },
    { cryptoAddresses: { chain: 'ethereum', address: 'invalid' } },
    { paymentWebhookUrl: null },
    { paymentWebhookUrl: 'http://merchant.example/payments' },
    { paymentWebhookSecret: null },
    { acceptThirdwebDonations: false },
  ])('reports donations unavailable for incomplete company configuration: %j', async (changes) => {
    await payload.db.collections.companies.updateOne({ _id: companyId }, { $set: changes })
    const req = await createLocalReq({}, payload)
    const result = await graphql({
      schema,
      source:
        'query DonationCompany($id: String!) { Company(id: $id) { canAcceptThirdwebDonations } }',
      variableValues: { id: String(companyId) },
      contextValue: { req },
    })
    expect(result.errors).toBeUndefined()
    expect(result.data?.Company).toMatchObject({ canAcceptThirdwebDonations: false })
  })

  it('reports donations unavailable when the operator has not configured Thirdweb', async () => {
    vi.stubEnv('THIRDWEB_WEBHOOK_SECRET', '')
    const company = await payload.findByID({
      collection: 'companies',
      id: String(companyId),
      overrideAccess: false,
    })
    expect(company.canAcceptThirdwebDonations).toBe(false)
  })

  it('recognizes issued credentials after a legacy secret is removed', async () => {
    const owner = await payload.findByID({ collection: 'users', id: String(ownerId) })
    await issueCompanyPaymentSecret(
      await createLocalReq({ user: owner }, payload),
      String(companyId),
      'rotate',
    )
    await payload.db.collections.companies.updateOne(
      { _id: companyId },
      { $unset: { paymentWebhookSecret: 1 } },
    )
    const company = await payload.findByID({
      collection: 'companies',
      id: String(companyId),
      overrideAccess: false,
    })
    expect(company.canAcceptThirdwebDonations).toBe(true)
    expect(company.paymentWebhookSecret).toBeUndefined()
    expect(company.paymentWebhookUrl).toBeUndefined()
  })

  it('creates and reads an anonymous checkout through GraphQL using authoritative product prices', async () => {
    const req = await createLocalReq({}, payload)
    const result = await graphql({
      schema,
      source: `mutation Checkout($input: HostedCheckoutInput!) {
        createHostedCheckoutSession(input: $input) { sessionId amountUsdCents receiver status }
      }`,
      variableValues: {
        input: {
          companyId: String(companyId),
          productId: String(productId),
          quantity: 2,
          amountUsdCents: 100,
        },
      },
      contextValue: { req },
    })
    expect(result.errors).toBeUndefined()
    expect(result.data?.createHostedCheckoutSession).toMatchObject({
      amountUsdCents: 1000,
      receiver: wallet,
      status: 'pending',
    })
    const stored = await payload.find({ collection: 'checkout-sessions', limit: 1 })
    const read = await graphql({
      schema,
      source:
        'query Checkout($id: String!) { hostedCheckoutSession(sessionId: $id) { sessionId amountUsdCents status } }',
      variableValues: { id: stored.docs[0].publicId },
      contextValue: { req },
    })
    expect(read.errors).toBeUndefined()
    expect(read.data?.hostedCheckoutSession).toMatchObject({
      sessionId: stored.docs[0].publicId,
      amountUsdCents: 1000,
    })
    expect(req.responseHeaders?.get('Cache-Control')).toBe('no-store')
  })

  it('verifies canonical GraphQL checkout signatures and rejects tampered merchant input', async () => {
    const input = {
      returnUrl: 'https://merchant.example/thanks',
      externalReference: 'order-123',
      amountUsdCents: 1000,
      companyId: String(companyId),
    }
    const timestamp = String(Math.floor(Date.now() / 1000))
    const req = await createLocalReq({}, payload)
    req.headers = new Headers({
      'x-nswap-timestamp': timestamp,
      'x-nswap-signature': signPaymentBody('merchant-secret', timestamp, stringify(input)),
    })
    const source = `mutation Checkout($input: HostedCheckoutInput!) {
      createHostedCheckoutSession(input: $input) { sessionId returnUrl checkoutUrl }
    }`
    const signed = await graphql({
      schema,
      source,
      variableValues: { input },
      contextValue: { req },
    })
    expect(signed.errors).toBeUndefined()
    expect(signed.data?.createHostedCheckoutSession).toMatchObject({ returnUrl: input.returnUrl })
    const tampered = await graphql({
      schema,
      source,
      variableValues: { input: { ...input, returnUrl: 'https://attacker.example' } },
      contextValue: { req },
    })
    expect(tampered.errors?.[0].originalError).toMatchObject({ status: 401 })
    expect((await payload.count({ collection: 'checkout-sessions' })).totalDocs).toBe(1)
    expect(JSON.stringify(signed)).not.toContain('merchant-secret')
  })

  it('persists the signed return destination and rejects changes to it', async () => {
    const req = await createLocalReq({}, payload)
    const returnUrl = 'https://app.liberterra.io/me/merits/thank-you?orderId=donation-123'
    const body = JSON.stringify({
      companyId: companyId.toHexString(),
      amountUsdCents: 1000,
      returnUrl,
    })
    const timestamp = String(Math.floor(Date.now() / 1000))
    req.headers = new Headers({
      'x-nswap-timestamp': timestamp,
      'x-nswap-signature': signPaymentBody('merchant-secret', timestamp, body),
    })
    const session = await createCheckoutSession(req, body)
    expect(session).toMatchObject({ returnUrl, status: 'pending' })
    const stored = await findCheckoutSession(req, session.sessionId)
    expect(publicCheckoutSession(stored)).toMatchObject({ returnUrl })
    await expect(
      createCheckoutSession(req, body.replace('app.liberterra.io', 'attacker.example')),
    ).rejects.toMatchObject({ status: 401 })
    expect((await payload.count({ collection: 'checkout-sessions' })).totalDocs).toBe(1)
  })

  it('requires merchant authentication for return URLs even without an external reference', async () => {
    await expect(
      createCheckoutSession(
        await createLocalReq({}, payload),
        JSON.stringify({
          companyId: companyId.toHexString(),
          amountUsdCents: 1000,
          returnUrl: 'https://app.liberterra.io/me/merits/thank-you',
        }),
      ),
    ).rejects.toMatchObject({ status: 401 })
    expect((await payload.count({ collection: 'checkout-sessions' })).totalDocs).toBe(0)
  })

  it.each(['javascript:alert(1)', 'http://attacker.example', 'https://user:password@example.com'])(
    'rejects an unsafe return URL: %s',
    async (returnUrl) => {
      const body = JSON.stringify({
        companyId: companyId.toHexString(),
        amountUsdCents: 1000,
        returnUrl,
      })
      const req = await createLocalReq({}, payload)
      const timestamp = String(Math.floor(Date.now() / 1000))
      req.headers = new Headers({
        'x-nswap-timestamp': timestamp,
        'x-nswap-signature': signPaymentBody('merchant-secret', timestamp, body),
      })
      await expect(createCheckoutSession(req, body)).rejects.toThrow()
      expect((await payload.count({ collection: 'checkout-sessions' })).totalDocs).toBe(0)
    },
  )

  it('keeps integration credentials owner-only and ignores attempts to overwrite the signing secret', async () => {
    const owner = await payload.findByID({ collection: 'users', id: ownerId.toHexString() })
    const req = await createLocalReq({ user: owner }, payload)
    const updated = await payload.update({
      collection: 'companies',
      id: companyId.toHexString(),
      overrideAccess: false,
      req,
      data: {
        paymentWebhookUrl: 'https://merchant.example/new',
        paymentWebhookSecret: 'forged-secret',
      },
    })
    expect(updated.paymentWebhookSecret).toBeUndefined()
    const stored = await payload.findByID({
      collection: 'companies',
      id: companyId.toHexString(),
      req,
      overrideAccess: false,
      showHiddenFields: true,
      depth: 0,
    })
    expect(stored.paymentWebhookSecret).toBeUndefined()
    expect(await getPaymentWebhookSecret(req, companyId.toHexString())).toBe('merchant-secret')
    const versions = await payload.findVersions({
      collection: 'companies',
      where: { parent: { equals: companyId.toHexString() } },
      overrideAccess: false,
      depth: 0,
      req,
    })
    expect(versions.docs.length).toBeGreaterThan(0)
    const history = await graphql({
      schema,
      source: `query CompanyHistory($id: String!) {
        versionCompany(id: $id) { version { paymentWebhookSecret } }
        versionsCompanies { docs { version { paymentWebhookSecret } } }
      }`,
      variableValues: { id: String(versions.docs[0].id) },
      contextValue: { req },
    })
    expect(history.errors).toBeUndefined()
    expect(history.data).toMatchObject({
      versionCompany: { version: { paymentWebhookSecret: null } },
      versionsCompanies: { docs: [{ version: { paymentWebhookSecret: null } }] },
    })
    expect(JSON.stringify(history)).not.toContain('merchant-secret')
    const anonymous = await payload.findByID({
      collection: 'companies',
      id: companyId.toHexString(),
      overrideAccess: false,
      req: await createLocalReq({}, payload),
    })
    expect(anonymous.paymentWebhookSecret).toBeUndefined()
    expect(anonymous.paymentWebhookUrl).toBeUndefined()
  })

  it.each(['anonymous', 'other', 'owner', 'admin'] as const)(
    'restricts the dedicated payment settings query for %s callers',
    async (role) => {
      const ids = { other: otherUserId, owner: ownerId, admin: adminId }
      const user =
        role === 'anonymous'
          ? undefined
          : await payload.findByID({ collection: 'users', id: ids[role].toHexString() })
      const req = await createLocalReq({ user }, payload)
      const result = await graphql({
        schema,
        source: `query PaymentSettings($id: String!) {
          companyPaymentSettings(companyId: $id) { companyId paymentWebhookUrl hasWebhookSecret }
        }`,
        variableValues: { id: companyId.toHexString() },
        contextValue: { req },
      })
      expect(req.responseHeaders?.get('Cache-Control')).toBe('private, no-store')
      if (role === 'owner' || role === 'admin') {
        expect(result.errors).toBeUndefined()
        expect(result.data).toEqual({
          companyPaymentSettings: {
            companyId: companyId.toHexString(),
            paymentWebhookUrl: 'https://merchant.example/payments',
            hasWebhookSecret: true,
          },
        })
      } else {
        expect(result.errors?.[0].originalError).toMatchObject({
          status: role === 'anonymous' ? 401 : 403,
        })
        expect(result.data?.companyPaymentSettings).toBeNull()
        expect(JSON.stringify(result)).not.toContain('merchant-secret')
      }
      expect(JSON.stringify(result)).not.toContain('merchant-secret')
    },
  )

  it.each(['anonymous', 'other', 'owner', 'admin'] as const)(
    'authorizes one-time secret rotation for %s callers',
    async (role) => {
      const ids = { other: otherUserId, owner: ownerId, admin: adminId }
      const user =
        role === 'anonymous'
          ? undefined
          : await payload.findByID({
              collection: 'users',
              id: ids[role].toHexString(),
            })
      const req = await createLocalReq({ user }, payload)
      const result = await graphql({
        schema,
        source:
          'mutation Rotate($id: String!) { rotateCompanyPaymentSecret(companyId: $id) { companyId secret } }',
        variableValues: { id: companyId.toHexString() },
        contextValue: { req },
      })
      if (role === 'owner' || role === 'admin') {
        expect(result.errors).toBeUndefined()
        expect(await getPaymentWebhookSecret(req, companyId.toHexString())).not.toBe(
          'merchant-secret',
        )
        expect(JSON.stringify(result.data)).toContain(
          await getPaymentWebhookSecret(req, companyId.toHexString()),
        )
      } else {
        expect(result.errors?.[0].originalError).toMatchObject({
          status: role === 'anonymous' ? 401 : 403,
        })
        expect(await getPaymentWebhookSecret(req, companyId.toHexString())).toBe('merchant-secret')
      }
      expect(req.responseHeaders?.get('Cache-Control')).toBe('private, no-store')
    },
  )

  it('issues a new secret once and never returns it from settings or generic credential reads', async () => {
    await payload.db.collections.companies.updateOne(
      { _id: companyId },
      { $unset: { paymentWebhookSecret: 1 } },
    )
    const owner = await payload.findByID({ collection: 'users', id: ownerId.toHexString() })
    const req = await createLocalReq({ user: owner }, payload)
    const generated = await issueCompanyPaymentSecret(req, companyId.toHexString(), 'generate')
    expect(generated.secret).toMatch(/^[a-f0-9]{64}$/)
    await expect(
      issueCompanyPaymentSecret(req, companyId.toHexString(), 'generate'),
    ).rejects.toMatchObject({ status: 409 })
    const result = await graphql({
      schema,
      source:
        'query Settings($id: String!) { companyPaymentSettings(companyId: $id) { hasWebhookSecret } }',
      variableValues: { id: companyId.toHexString() },
      contextValue: { req },
    })
    expect(result.errors).toBeUndefined()
    expect(result.data).toMatchObject({ companyPaymentSettings: { hasWebhookSecret: true } })
    expect(JSON.stringify(result)).not.toContain(generated.secret)
    await expect(
      payload.find({ collection: 'payment-webhook-credentials', overrideAccess: false, req }),
    ).rejects.toMatchObject({ status: 403 })
    const rotated = await issueCompanyPaymentSecret(req, companyId.toHexString(), 'rotate')
    expect(rotated.secret).not.toBe(generated.secret)
    await payload.update({
      collection: 'companies',
      id: companyId.toHexString(),
      req,
      overrideAccess: false,
      data: { name: 'Updated merchant' },
    })
    expect(await getPaymentWebhookSecret(req, companyId.toHexString())).toBe(rotated.secret)
  })

  it('rejects the previous secret and signs pending-session notifications with the rotated key', async () => {
    const guest = await createLocalReq({}, payload)
    const session = await createCheckoutSession(
      guest,
      JSON.stringify({ companyId: companyId.toHexString(), amountUsdCents: 1000 }),
    )
    const owner = await payload.findByID({ collection: 'users', id: ownerId.toHexString() })
    const req = await createLocalReq({ user: owner }, payload)
    const rotated = await issueCompanyPaymentSecret(req, companyId.toHexString(), 'rotate')
    const body = JSON.stringify({
      companyId: companyId.toHexString(),
      amountUsdCents: 1000,
      externalReference: 'external-order',
    })
    const timestamp = String(Math.floor(Date.now() / 1000))
    guest.headers = new Headers({
      'x-nswap-timestamp': timestamp,
      'x-nswap-signature': signPaymentBody('merchant-secret', timestamp, body),
    })
    await expect(createCheckoutSession(guest, body)).rejects.toMatchObject({ status: 401 })
    guest.headers.set('x-nswap-signature', signPaymentBody(rotated.secret, timestamp, body))
    await createCheckoutSession(guest, body)
    const provider = await providerRequest(payload, providerEvent(session.sessionId, wallet))
    await acceptThirdwebPayment(provider.req, provider.body)
    await payload.jobs.run({ queue: 'notifications', overrideAccess: true, limit: 10 })
    const options = vi.mocked(guardedFetch).mock.calls[0][1]
    const headers = new Headers(options?.headers)
    expect(headers.get('x-nswap-signature')).toBe(
      signPaymentBody(rotated.secret, headers.get('x-nswap-timestamp')!, String(options?.body)),
    )
  })

  it('allows only one concurrent rotation and never returns a superseded secret', async () => {
    const owner = await payload.findByID({ collection: 'users', id: ownerId.toHexString() })
    const req = await createLocalReq({ user: owner }, payload)
    await issueCompanyPaymentSecret(req, companyId.toHexString(), 'rotate')
    const credential = await payload.db.findOne({
      collection: 'payment-webhook-credentials',
      where: { company: { equals: companyId.toHexString() } },
      req,
    })
    const release = synchronizeMongoWrites(
      payload,
      'payment-webhook-credentials',
      String(credential!.id),
    )
    try {
      const results = await Promise.allSettled([
        issueCompanyPaymentSecret(
          await createLocalReq({ user: owner }, payload),
          companyId.toHexString(),
          'rotate',
        ),
        issueCompanyPaymentSecret(
          await createLocalReq({ user: owner }, payload),
          companyId.toHexString(),
          'rotate',
        ),
      ])
      const issued = results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value.secret] : [],
      )
      expect(issued).toHaveLength(1)
      expect(await getPaymentWebhookSecret(req, companyId.toHexString())).toBe(issued[0])
      expect(
        results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : [])),
      ).toMatchObject([{ status: 409 }])
    } finally {
      release()
    }
  })

  it.each(['anonymous', 'other', 'owner', 'admin'] as const)(
    'never returns the signing secret through ordinary company reads for %s callers',
    async (role) => {
      const ids = { other: otherUserId, owner: ownerId, admin: adminId }
      const user =
        role === 'anonymous'
          ? undefined
          : await payload.findByID({ collection: 'users', id: ids[role].toHexString() })
      const req = await createLocalReq({ user }, payload)
      const result = await graphql({
        schema,
        source: `query CompanyRecords($id: String!) {
          Company(id: $id) { id paymentWebhookSecret }
          Companies { docs { id paymentWebhookSecret } }
        }`,
        variableValues: { id: companyId.toHexString() },
        contextValue: { req },
      })
      expect(result.errors).toBeUndefined()
      expect(result.data).toMatchObject({
        Company: { id: companyId.toHexString(), paymentWebhookSecret: null },
        Companies: { docs: [{ id: companyId.toHexString(), paymentWebhookSecret: null }] },
      })
      const ordinary = await payload.findByID({
        collection: 'companies',
        id: companyId.toHexString(),
        req,
        overrideAccess: false,
        depth: 0,
      })
      expect(ordinary.paymentWebhookSecret).toBeUndefined()
    },
  )

  it('accepts guest donations but requires a signed merchant request for an external account reference', async () => {
    const req = await createLocalReq({}, payload)
    const body = JSON.stringify({
      companyId: companyId.toHexString(),
      amountUsdCents: 1000,
      externalReference: 'donation-123',
    })
    await expect(createCheckoutSession(req, body)).rejects.toMatchObject({ status: 401 })
    const timestamp = String(Math.floor(Date.now() / 1000))
    req.headers = new Headers({
      'x-nswap-timestamp': timestamp,
      'x-nswap-signature': signPaymentBody('merchant-secret', timestamp, body),
    })
    const session = await createCheckoutSession(req, body)
    expect(session).toMatchObject({ amountUsdCents: 1000, receiver: wallet })
    const stored = await findCheckoutSession(req, session.sessionId)
    expect(stored.externalReference).toBe('donation-123')
    expect(publicCheckoutSession(stored)).not.toHaveProperty('webhookSecret')
    expect(publicCheckoutSession(stored)).not.toHaveProperty('externalReference')
  })

  it('loads product prices from the backend rather than accepting a caller price', async () => {
    const req = await createLocalReq({}, payload)
    const session = await createCheckoutSession(
      req,
      JSON.stringify({
        companyId: companyId.toHexString(),
        productId: productId.toHexString(),
        quantity: 2,
        amountUsdCents: 100,
      }),
    )
    expect(session.amountUsdCents).toBe(1000)
    await payload.db.collections.products.updateOne(
      { _id: productId },
      { company: new Types.ObjectId() },
    )
    await expect(
      createCheckoutSession(
        req,
        JSON.stringify({ companyId: companyId.toHexString(), productId: productId.toHexString() }),
      ),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('persists original Thirdweb evidence only after verification and delivers a signed, idempotent notification', async () => {
    const req = await createLocalReq({}, payload)
    const session = await createCheckoutSession(
      req,
      JSON.stringify({ companyId: companyId.toHexString(), amountUsdCents: 1000 }),
    )
    const provider = await providerRequest(payload, providerEvent(session.sessionId, wallet))
    await acceptThirdwebPayment(provider.req, provider.body)
    await acceptThirdwebPayment(provider.req, provider.body)
    expect((await findCheckoutSession(req, session.sessionId)).status).toBe('paid')
    await payload.jobs.run({ queue: 'notifications', overrideAccess: true, limit: 10 })
    expect(guardedFetch).toHaveBeenCalledTimes(1)
    const [url, options] = vi.mocked(guardedFetch).mock.calls[0]
    expect(url).toBe('https://merchant.example/payments')
    expect(options).toMatchObject({ method: 'POST', httpsOnly: true, maxRedirects: 0 })
    const stored = await findCheckoutSession(req, session.sessionId)
    expect(stored.notification).toMatchObject({
      id: session.sessionId,
      thirdweb: {
        rawBody: provider.body,
        signatureHeaders: { 'x-pay-signature': provider.req.headers.get('x-pay-signature') },
      },
      verification: { signatureVerified: true, receiverMatched: true, amountSatisfied: true },
      settlement: { amount: '10000000', chainId: 8453 },
    })
    const headers = new Headers(options?.headers)
    expect(headers.get('x-nswap-signature')).toBe(
      signPaymentBody('merchant-secret', headers.get('x-nswap-timestamp')!, String(options?.body)),
    )
    expect(stored.deliveredAt).toBeTruthy()
  })

  it('recovers notification queuing after payment persistence without replacing the original evidence', async () => {
    const req = await createLocalReq({}, payload)
    const session = await createCheckoutSession(
      req,
      JSON.stringify({ companyId: companyId.toHexString(), amountUsdCents: 1000 }),
    )
    const provider = await providerRequest(payload, providerEvent(session.sessionId, wallet))
    const queue = vi
      .spyOn(payload.jobs, 'queue')
      .mockRejectedValueOnce(new Error('Queue unavailable'))
    await expect(acceptThirdwebPayment(provider.req, provider.body)).rejects.toThrow(
      'Queue unavailable',
    )
    const original = await findCheckoutSession(req, session.sessionId)
    expect(original.status).toBe('paid')
    await acceptThirdwebPayment(provider.req, provider.body)
    expect((await findCheckoutSession(req, session.sessionId)).notification).toEqual(
      original.notification,
    )
    expect(queue).toHaveBeenCalledTimes(2)
    queue.mockRestore()
    await payload.jobs.run({ queue: 'notifications', overrideAccess: true, limit: 10 })
    expect((await findCheckoutSession(req, session.sessionId)).deliveredAt).toBeTruthy()
  })

  it('does not let one provider payment fund a second checkout session', async () => {
    const req = await createLocalReq({}, payload)
    const body = JSON.stringify({ companyId: companyId.toHexString(), amountUsdCents: 1000 })
    const first = await createCheckoutSession(req, body)
    const second = await createCheckoutSession(req, body)
    const event = providerEvent(first.sessionId, wallet)
    const provider = await providerRequest(payload, event)
    await acceptThirdwebPayment(provider.req, provider.body)
    event.data.purchaseData.nswapSessionId = second.sessionId
    const reused = await providerRequest(payload, event)
    await expect(acceptThirdwebPayment(reused.req, reused.body)).rejects.toThrow()
    expect((await findCheckoutSession(req, second.sessionId)).status).toBe('pending')
    expect((await findCheckoutSession(req, first.sessionId)).status).toBe('paid')
  })

  it('refuses to create payable sessions when the operator webhook is not configured', async () => {
    vi.stubEnv('THIRDWEB_WEBHOOK_SECRET', '')
    await expect(
      createCheckoutSession(
        await createLocalReq({}, payload),
        JSON.stringify({ companyId: companyId.toHexString(), amountUsdCents: 1000 }),
      ),
    ).rejects.toMatchObject({ status: 503 })
    expect((await payload.count({ collection: 'checkout-sessions' })).totalDocs).toBe(0)
  })

  it.each(['receiver', 'amount', 'chain', 'token', 'signature', 'timestamp'] as const)(
    'rejects a %s mismatch without marking payment complete',
    async (field) => {
      const req = await createLocalReq({}, payload)
      const session = await createCheckoutSession(
        req,
        JSON.stringify({ companyId: companyId.toHexString(), amountUsdCents: 1000 }),
      )
      const event = providerEvent(session.sessionId, wallet)
      switch (field) {
        case 'receiver':
          event.data.receiver = `0x${'3'.repeat(40)}`
          break
        case 'amount':
          event.data.destinationAmount = '9999999'
          break
        case 'chain':
          event.data.destinationToken.chainId = 1
          break
        case 'token':
          event.data.destinationToken.address = `0x${'3'.repeat(40)}`
          break
      }
      const provider = await providerRequest(
        payload,
        event,
        field === 'timestamp' ? '1' : String(Math.floor(Date.now() / 1000)),
      )
      if (field === 'signature') {
        provider.req.headers.set('x-pay-signature', '0'.repeat(64))
      }
      await expect(acceptThirdwebPayment(provider.req, provider.body)).rejects.toThrow()
      expect((await findCheckoutSession(req, session.sessionId)).status).toBe('pending')
      expect((await payload.count({ collection: 'payload-jobs' })).totalDocs).toBe(0)
    },
  )
})
