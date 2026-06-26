import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import type { Field } from 'payload'

import { buildNotificationSubscriptionDocumentID } from '@/newsletter/notificationSubscriptions'
import { collectDocumentChanges, renderItemUpdateEmail } from '@/utilities/notificationDiff'
import type { Product } from '@/payload-types'
import { toStringID } from '@/utilities/toStringID'

let payload: Payload | null = null
let bootstrapError: Error | null = null
let graphqlPost: ((request: Request) => Promise<Response>) | null = null
const originalFrontendURL = process.env.FRONTEND_URL
type SentEmailArgs = Parameters<Payload['sendEmail']>[0]

const trackedCollections = [
  'notification-subscriptions',
  'subscribers',
  'products',
  'startups',
  'jobs',
  'companies',
  'identities',
  'users',
] as const

const createdDocumentIDs: Record<(typeof trackedCollections)[number], string[]> = {
  companies: [],
  identities: [],
  jobs: [],
  'notification-subscriptions': [],
  products: [],
  startups: [],
  subscribers: [],
  users: [],
}

const createdOauthAccessTokenIDs: string[] = []

type TestUser = {
  email: string
  id: string
}

type AuthenticatedTestUser = TestUser & {
  token: string
}

const getRelationshipID = <TRelation extends { id: string }>(
  value: null | string | TRelation | undefined,
): string | null => {
  if (typeof value === 'string') {
    return value
  }

  return value?.id ?? null
}

const getSentEmailHTML = (value: SentEmailArgs['html']): string =>
  typeof value === 'string' ? value : ''

type GraphQLResponseBody = {
  data?: {
    createNotificationSubscription?: {
      email: string
      id: string
      targetCollection: 'companies' | 'identities' | 'jobs' | 'products' | 'startups'
      targetID: string
    } | null
    deleteNotificationSubscription?: {
      id: string
    } | null
    notificationSubscriptions?: {
      docs: Array<{ id: string }>
      totalDocs: number
    }
  }
  errors?: Array<{ message?: string }>
}

const quoteGraphQLString = (value: string): string => JSON.stringify(value)

const runGraphQLOperation = async ({
  bearerToken,
  query,
}: {
  bearerToken?: string
  query: string
}): Promise<GraphQLResponseBody> => {
  if (!graphqlPost) {
    throw new Error('GraphQL route is not available.')
  }

  const request = new Request('http://localhost:3001/api/graphql', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}),
    },
    body: JSON.stringify({ query }),
  })

  const response = await graphqlPost(request)
  return (await response.json()) as GraphQLResponseBody
}

const createNotificationSubscriptionMutation = ({
  targetCollection,
  targetID,
}: {
  targetCollection: 'companies' | 'identities' | 'jobs' | 'products' | 'startups'
  targetID: string
}): string => `
  mutation {
    createNotificationSubscription(
      data: {
        targetCollection: ${targetCollection}
        targetID: ${quoteGraphQLString(targetID)}
      }
    ) {
      id
      email
      targetCollection
      targetID
    }
  }
`

const deleteNotificationSubscriptionMutation = (id: string): string => `
  mutation {
    deleteNotificationSubscription(id: ${quoteGraphQLString(id)}) {
      id
    }
  }
`

const createBearerToken = async (userID: string): Promise<string> => {
  if (!payload) {
    throw new Error('Payload is not available.')
  }

  const accessToken = `test-oidc-access-token-${crypto.randomUUID()}`
  const tokenRecord = await payload.create({
    collection: 'oauthAccessTokens',
    data: {
      accessToken,
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      scopes: 'openid profile email',
      user: userID,
    },
  })

  createdOauthAccessTokenIDs.push(String(tokenRecord.id))

  return accessToken
}

const createAuthenticatedUser = async (email: string): Promise<AuthenticatedTestUser> => {
  if (!payload) {
    throw new Error('Payload is not available.')
  }

  const user = await payload.create({
    collection: 'users',
    data: {
      email,
      emailVerified: true,
      name: 'Authenticated User',
    },
    draft: false,
  })

  const userID = toStringID(user.id)
  if (!userID) {
    throw new Error('User ID is missing.')
  }

  createdDocumentIDs.users.push(userID)
  const token = await createBearerToken(userID)

  return {
    email: user.email,
    id: userID,
    token,
  }
}

describe('Notification subscriptions collection GraphQL', () => {
  beforeAll(async () => {
    process.env.FRONTEND_URL = 'https://frontend.example.com'

    try {
      const [{ getPayload }, configModule, graphqlRouteModule] = await Promise.all([
        import('payload'),
        import('@/payload.config'),
        import('@/app/(payload)/api/graphql/route'),
      ])

      const payloadConfig = await configModule.default
      payload = await getPayload({ config: payloadConfig })
      graphqlPost = graphqlRouteModule.POST
    } catch (error) {
      bootstrapError = error instanceof Error ? error : new Error('Unknown Payload bootstrap error')
    }
  })

  afterAll(() => {
    process.env.FRONTEND_URL = originalFrontendURL
  })

  afterEach(async () => {
    if (!payload) {
      return
    }

    for (const collection of trackedCollections) {
      const ids = createdDocumentIDs[collection]

      for (const id of ids.reverse()) {
        await payload.delete({
          collection,
          id,
        })
      }

      createdDocumentIDs[collection] = []
    }

    for (const id of createdOauthAccessTokenIDs.reverse()) {
      await payload.delete({
        collection: 'oauthAccessTokens',
        id,
      })
    }

    createdOauthAccessTokenIDs.length = 0

    vi.restoreAllMocks()
  })

  it('derives notification subscription email from the authenticated user context', async () => {
    if (bootstrapError || !payload || !graphqlPost) {
      return
    }

    const authUser = await createAuthenticatedUser(`subscriber-${Date.now()}@example.com`)

    const identity = await payload.create({
      collection: 'identities',
      data: {
        createdBy: 'system',
        description: 'Identity for notifications.',
        name: 'Notification Tribe',
        website: 'https://example.com/tribe',
      },
      draft: false,
    })
    const identityID = String(identity.id)
    createdDocumentIDs.identities.push(identityID)

    const company = await payload.create({
      collection: 'companies',
      data: {
        _status: 'published',
        createdBy: 'system',
        description: 'Company for notifications.',
        email: 'company@example.com',
        identity: identityID,
        name: 'Notification Company',
        website: 'https://example.com/company',
      },
      draft: false,
    })
    const companyID = String(company.id)
    createdDocumentIDs.companies.push(companyID)

    const job = await payload.create({
      collection: 'jobs',
      data: {
        _status: 'published',
        company: companyID,
        createdBy: 'system',
        description: 'Initial description.',
        employmentType: 'full-time',
        positions: 1,
        postedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        title: 'Notification Engineer',
      },
      draft: false,
    })
    const jobID = String(job.id)
    createdDocumentIDs.jobs.push(jobID)

    const email = authUser.email
    const subscriptionID = buildNotificationSubscriptionDocumentID({
      email,
      targetCollection: 'jobs',
      targetID: jobID,
    })

    const createResponse = await runGraphQLOperation({
      bearerToken: authUser.token,
      query: createNotificationSubscriptionMutation({
        targetCollection: 'jobs',
        targetID: jobID,
      }),
    })

    expect(createResponse.errors).toBeUndefined()
    expect(createResponse.data?.createNotificationSubscription).toMatchObject({
      email,
      id: subscriptionID,
      targetCollection: 'jobs',
      targetID: jobID,
    })
    createdDocumentIDs['notification-subscriptions'].push(subscriptionID)

    const subscriptions = await payload.find({
      collection: 'notification-subscriptions',
      depth: 0,
      limit: 10,
      overrideAccess: false,
      user: authUser,
      where: {
        id: {
          equals: subscriptionID,
        },
      },
    })

    expect(subscriptions.docs).toHaveLength(1)
    createdDocumentIDs.subscribers.push(String(subscriptions.docs[0].subscriber))

    const deleteResponse = await runGraphQLOperation({
      bearerToken: authUser.token,
      query: deleteNotificationSubscriptionMutation(subscriptionID),
    })

    expect(deleteResponse.errors).toBeUndefined()
    expect(deleteResponse.data?.deleteNotificationSubscription).toMatchObject({
      id: subscriptionID,
    })

    createdDocumentIDs['notification-subscriptions'] = []
    createdDocumentIDs.subscribers = []
  })

  it('uses the authenticated user context for subscription status on jobs, identities, and products', async () => {
    if (bootstrapError || !payload) {
      return
    }

    const authUser = await createAuthenticatedUser(`linked-${Date.now()}@example.com`)

    const identity = await payload.create({
      collection: 'identities',
      data: {
        createdBy: 'system',
        description: 'Identity for linked-user notifications.',
        name: 'Subscribed Tribe',
        website: 'https://example.com/subscribed-tribe',
      },
      draft: false,
    })
    const identityID = String(identity.id)
    createdDocumentIDs.identities.push(identityID)

    const company = await payload.create({
      collection: 'companies',
      data: {
        _status: 'published',
        createdBy: 'system',
        description: 'Company for linked-user notifications.',
        email: 'linked-company@example.com',
        identity: identityID,
        name: 'Subscribed Company',
        website: 'https://example.com/subscribed-company',
      },
      draft: false,
    })
    const companyID = String(company.id)
    createdDocumentIDs.companies.push(companyID)

    const job = await payload.create({
      collection: 'jobs',
      data: {
        _status: 'published',
        company: companyID,
        createdBy: 'system',
        description: 'Linked-user job description.',
        employmentType: 'full-time',
        positions: 1,
        postedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        title: 'Subscribed Job',
      },
      draft: false,
    })
    const jobID = String(job.id)
    createdDocumentIDs.jobs.push(jobID)

    const product = await payload.create({
      collection: 'products',
      data: {
        _status: 'published',
        company: companyID,
        name: 'Subscribed Product',
      },
      draft: false,
    })
    const productID = String(product.id)
    createdDocumentIDs.products.push(productID)

    const jobSubscriptionID = buildNotificationSubscriptionDocumentID({
      email: authUser.email,
      targetCollection: 'jobs',
      targetID: jobID,
    })

    const identitySubscriptionID = buildNotificationSubscriptionDocumentID({
      email: authUser.email,
      targetCollection: 'identities',
      targetID: identityID,
    })

    const productSubscriptionID = buildNotificationSubscriptionDocumentID({
      email: authUser.email,
      targetCollection: 'products',
      targetID: productID,
    })

    const [jobSubscriptionResponse, identitySubscriptionResponse, productSubscriptionResponse] = await Promise.all([
      runGraphQLOperation({
        bearerToken: authUser.token,
        query: createNotificationSubscriptionMutation({
          targetCollection: 'jobs',
          targetID: jobID,
        }),
      }),
      runGraphQLOperation({
        bearerToken: authUser.token,
        query: createNotificationSubscriptionMutation({
          targetCollection: 'identities',
          targetID: identityID,
        }),
      }),
      runGraphQLOperation({
        bearerToken: authUser.token,
        query: createNotificationSubscriptionMutation({
          targetCollection: 'products',
          targetID: productID,
        }),
      }),
    ])

    expect(jobSubscriptionResponse.errors).toBeUndefined()
    expect(jobSubscriptionResponse.data?.createNotificationSubscription).toMatchObject({
      email: authUser.email,
      id: jobSubscriptionID,
      targetCollection: 'jobs',
      targetID: jobID,
    })
    expect(identitySubscriptionResponse.errors).toBeUndefined()
    expect(identitySubscriptionResponse.data?.createNotificationSubscription).toMatchObject({
      email: authUser.email,
      id: identitySubscriptionID,
      targetCollection: 'identities',
      targetID: identityID,
    })
    expect(productSubscriptionResponse.errors).toBeUndefined()
    expect(productSubscriptionResponse.data?.createNotificationSubscription).toMatchObject({
      email: authUser.email,
      id: productSubscriptionID,
      targetCollection: 'products',
      targetID: productID,
    })

    createdDocumentIDs['notification-subscriptions'].push(jobSubscriptionID)
    createdDocumentIDs['notification-subscriptions'].push(identitySubscriptionID)
    createdDocumentIDs['notification-subscriptions'].push(productSubscriptionID)

    const readableSubscriptions = await payload.find({
      collection: 'notification-subscriptions',
      depth: 0,
      limit: 10,
      overrideAccess: false,
      user: authUser,
      where: {
        createdBy: {
          equals: authUser.id,
        },
      },
    })

    expect(readableSubscriptions.docs).toHaveLength(3)
    createdDocumentIDs.subscribers.push(
      ...readableSubscriptions.docs.map((subscription) => String(subscription.subscriber)),
    )

    const publicJob = await payload.findByID({
      collection: 'jobs',
      id: jobID,
      depth: 0,
      overrideAccess: false,
    })

    expect(publicJob.isSubscribed).toBe(false)

    const subscribedJob = await payload.findByID({
      collection: 'jobs',
      id: jobID,
      depth: 0,
      overrideAccess: false,
      user: authUser,
    })

    expect(subscribedJob.isSubscribed).toBe(true)

    const subscribedIdentity = await payload.findByID({
      collection: 'identities',
      id: identityID,
      depth: 0,
      overrideAccess: false,
      user: authUser,
    })

    expect(subscribedIdentity.isSubscribed).toBe(true)

    const subscribedProduct = await payload.findByID({
      collection: 'products',
      id: productID,
      depth: 0,
      overrideAccess: false,
      user: authUser,
    })

    expect(subscribedProduct.isSubscribed).toBe(true)
  })

  it('renders notification emails with frontend detail URLs for tribes', async () => {
    const email = await renderItemUpdateEmail({
      changes: [
        {
          after: 'Updated tribe description.',
          before: 'Initial tribe description.',
          label: 'Description',
          path: 'description',
        },
      ],
      collection: 'identities',
      docID: 'tribe-123',
      title: 'Frontend Tribe',
      unsubscribeURL:
        'https://frontend.example.com/unsubscribe?type=Tribes&id=tribe-123&email=tribe@example.com&serverUrl=68747470733a2f2f7365727665722e6578616d706c652e636f6d',
    })

    expect(email.html).toContain('https://frontend.example.com/tribes/tribe-123')
    expect(email.text).toContain('https://frontend.example.com/tribes/tribe-123')
    expect(email.html).not.toContain('/admin/collections/identities/tribe-123')
    expect(email.text).not.toContain('/admin/collections/identities/tribe-123')
  })

  it('omits hidden and readonly fields from notification diffs', () => {
    const fields: Field[] = [
      {
        name: 'name',
        type: 'text',
      },
      {
        name: 'url',
        type: 'text',
        admin: {
          hidden: true,
        },
      },
      {
        name: 'priceInETH',
        type: 'text',
        virtual: true,
        admin: {
          hidden: true,
          readOnly: true,
        },
      },
    ]

    const previousDoc: Product = {
      _status: 'draft',
      company: 'company-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      id: 'product-1',
      name: 'Old Product Name',
      priceInETH: '1.00',
      updatedAt: '2026-01-01T00:00:00.000Z',
      url: 'https://example.com/old-product',
    }

    const nextDoc: Product = {
      ...previousDoc,
      _status: 'published',
      name: 'New Product Name',
      priceInETH: '2.00',
      updatedAt: '2026-01-02T00:00:00.000Z',
      url: 'https://example.com/new-product',
    }

    expect(
      collectDocumentChanges({
        fields,
        nextDoc,
        previousDoc,
      }),
    ).toEqual([
      {
        after: 'New Product Name',
        before: 'Old Product Name',
        label: 'Name',
        path: 'name',
      },
    ])
  })

  it('notifies tribe subscribers when a new published company is created under that tribe', async () => {
    if (bootstrapError || !payload) {
      return
    }

    const sendEmailSpy = vi.spyOn(payload, 'sendEmail').mockImplementation(async () => undefined)

    const identity = await payload.create({
      collection: 'identities',
      data: {
        createdBy: 'system',
        description: 'Identity for company publication notifications.',
        name: 'Publication Tribe',
        website: 'https://example.com/publication-tribe',
      },
      draft: false,
    })
    const identityID = String(identity.id)
    createdDocumentIDs.identities.push(identityID)

    const subscriberUser = await createAuthenticatedUser(`tribe-published-company-${Date.now()}@example.com`)
    const subscriptionEmail = subscriberUser.email
    const subscription = await payload.create({
      collection: 'notification-subscriptions',
      data: {
        targetCollection: 'identities',
        targetID: identityID,
      },
      overrideAccess: false,
      user: subscriberUser,
    })
    createdDocumentIDs['notification-subscriptions'].push(String(subscription.id))

    const subscriberID = getRelationshipID(subscription.subscriber)
    if (subscriberID) {
      createdDocumentIDs.subscribers.push(subscriberID)
    }

    const company = await payload.create({
      collection: 'companies',
      data: {
        _status: 'published',
        createdBy: 'system',
        description: 'Freshly published company.',
        email: 'published-company@example.com',
        identity: identityID,
        name: 'Fresh Company',
        website: 'https://example.com/fresh-company',
      },
      draft: false,
    })
    const companyID = String(company.id)
    createdDocumentIDs.companies.push(companyID)

    expect(sendEmailSpy).toHaveBeenCalledTimes(1)

    const sentEmail = sendEmailSpy.mock.calls[0]?.[0]

    expect(sentEmail?.to).toBe(subscriptionEmail)
    expect(sentEmail?.subject).toBe('New Company: Fresh Company')
    expect(sentEmail?.html).toContain(`https://frontend.example.com/companies/${companyID}`)
    expect(sentEmail?.text).toContain(`https://frontend.example.com/companies/${companyID}`)
    expect(sentEmail?.html).toContain(
      `type=Tribes&id=${identityID}&email=${encodeURIComponent(subscriptionEmail)}`,
    )
  })

  it('notifies company subscribers when new jobs, ventures, and products are published under that company', async () => {
    if (bootstrapError || !payload) {
      return
    }

    const sendEmailSpy = vi.spyOn(payload, 'sendEmail').mockImplementation(async () => undefined)

    const identity = await payload.create({
      collection: 'identities',
      data: {
        createdBy: 'system',
        description: 'Identity for child publication notifications.',
        name: 'Company Notification Tribe',
        website: 'https://example.com/company-notification-tribe',
      },
      draft: false,
    })
    const identityID = String(identity.id)
    createdDocumentIDs.identities.push(identityID)

    const company = await payload.create({
      collection: 'companies',
      data: {
        _status: 'published',
        createdBy: 'system',
        description: 'Company with subscribers.',
        email: 'subscribed-company@example.com',
        identity: identityID,
        name: 'Subscriber Company',
        website: 'https://example.com/subscriber-company',
      },
      draft: false,
    })
    const companyID = String(company.id)
    createdDocumentIDs.companies.push(companyID)

    const subscriberUser = await createAuthenticatedUser(`company-published-items-${Date.now()}@example.com`)
    const subscriptionEmail = subscriberUser.email
    const subscription = await payload.create({
      collection: 'notification-subscriptions',
      data: {
        targetCollection: 'companies',
        targetID: companyID,
      },
      overrideAccess: false,
      user: subscriberUser,
    })
    createdDocumentIDs['notification-subscriptions'].push(String(subscription.id))

    const subscriberID = getRelationshipID(subscription.subscriber)
    if (subscriberID) {
      createdDocumentIDs.subscribers.push(subscriberID)
    }

    const job = await payload.create({
      collection: 'jobs',
      data: {
        _status: 'published',
        company: companyID,
        createdBy: 'system',
        description: 'Newly published job.',
        employmentType: 'full-time',
        positions: 1,
        postedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        title: 'Fresh Job',
      },
      draft: false,
    })
    const jobID = String(job.id)
    createdDocumentIDs.jobs.push(jobID)

    const startup = await payload.create({
      collection: 'startups',
      data: {
        _status: 'published',
        company: companyID,
        createdBy: 'system',
        description: 'Newly published venture.',
        identity: identityID,
        stage: 'idea',
        title: 'Fresh Venture',
      },
      draft: false,
    })
    const startupID = String(startup.id)
    createdDocumentIDs.startups.push(startupID)

    const product = await payload.create({
      collection: 'products',
      data: {
        company: companyID,
        name: 'Draft Product',
      },
      draft: true,
    })
    const productID = String(product.id)
    createdDocumentIDs.products.push(productID)

    expect(sendEmailSpy).toHaveBeenCalledTimes(2)

    await payload.update({
      collection: 'products',
      id: productID,
      data: {
        _status: 'published',
      },
      draft: false,
    })

    expect(sendEmailSpy).toHaveBeenCalledTimes(3)

    const subjects = sendEmailSpy.mock.calls.map((call) => call[0]?.subject)
    const htmlBodies = sendEmailSpy.mock.calls.map((call) => getSentEmailHTML(call[0]?.html))

    expect(subjects).toContain('New Job: Fresh Job')
    expect(subjects).toContain('New Venture: Fresh Venture')
    expect(subjects).toContain('New Product: Draft Product')
    expect(
      htmlBodies.some((html) => html.includes(`https://frontend.example.com/jobs/${jobID}`)),
    ).toBe(true)
    expect(
      htmlBodies.some((html) =>
        html.includes(`https://frontend.example.com/ventures/${startupID}`),
      ),
    ).toBe(true)
    expect(
      htmlBodies.some((html) =>
        html.includes(`https://frontend.example.com/products-services/${productID}`),
      ),
    ).toBe(true)
    expect(
      htmlBodies.every((html) =>
        html.includes(
          `type=Companies&id=${companyID}&email=${encodeURIComponent(subscriptionEmail)}`,
        ),
      ),
    ).toBe(true)
  })
})
