import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import { buildNotificationSubscriptionDocumentID } from '@/newsletter/notificationSubscriptions'
import { renderItemUpdateEmail } from '@/utilities/notificationDiff'
import type { User } from '@/payload-types'

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

const runGraphQLOperation = async (query: string): Promise<GraphQLResponseBody> => {
  if (!graphqlPost) {
    throw new Error('GraphQL route is not available.')
  }

  const request = new Request('http://localhost:3000/api/graphql', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })

  const response = await graphqlPost(request)
  return (await response.json()) as GraphQLResponseBody
}

const createNotificationSubscriptionMutation = ({
  email,
  targetCollection,
  targetID,
}: {
  email: string
  targetCollection: 'companies' | 'identities' | 'jobs' | 'products' | 'startups'
  targetID: string
}): string => `
  mutation {
    createNotificationSubscription(
      data: {
        email: ${quoteGraphQLString(email)}
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

const listNotificationSubscriptionsQuery = (email: string): string => `
  query {
    notificationSubscriptions(
      limit: 10
      where: {
        email: {
          equals: ${quoteGraphQLString(email)}
        }
      }
    ) {
      totalDocs
      docs {
        id
      }
    }
  }
`

const createLinkedUser = async (email: string): Promise<User> => {
  if (!payload) {
    throw new Error('Payload is not available.')
  }

  const user = await payload.create({
    collection: 'users',
    data: {
      email,
      emailVerified: false,
      name: 'Linked User',
    },
    draft: false,
  })

  createdDocumentIDs.users.push(user.id)

  const relatedCompanies = await payload.find({
    collection: 'companies',
    depth: 0,
    limit: 10,
    where: {
      createdBy: {
        equals: user.id,
      },
    },
  })

  relatedCompanies.docs.forEach((company) => {
    createdDocumentIDs.companies.push(company.id)
  })

  return user
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

    vi.restoreAllMocks()
  })

  it('allows anonymous GraphQL create and delete for unlinked emails without exposing read access', async () => {
    if (bootstrapError || !payload || !graphqlPost) {
      return
    }

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
    createdDocumentIDs.identities.push(identity.id)

    const company = await payload.create({
      collection: 'companies',
      data: {
        _status: 'published',
        createdBy: 'system',
        description: 'Company for notifications.',
        email: 'company@example.com',
        identity: identity.id,
        name: 'Notification Company',
        website: 'https://example.com/company',
      },
      draft: false,
    })
    createdDocumentIDs.companies.push(company.id)

    const job = await payload.create({
      collection: 'jobs',
      data: {
        _status: 'published',
        company: company.id,
        createdBy: 'system',
        description: 'Initial description.',
        employmentType: 'full-time',
        positions: 1,
        postedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        title: 'Notification Engineer',
      },
      draft: false,
    })
    createdDocumentIDs.jobs.push(job.id)

    const email = `job-updates-${Date.now()}@example.com`
    const subscriptionID = buildNotificationSubscriptionDocumentID({
      email,
      targetCollection: 'jobs',
      targetID: job.id,
    })

    const createResponse = await runGraphQLOperation(
      createNotificationSubscriptionMutation({
        email,
        targetCollection: 'jobs',
        targetID: job.id,
      }),
    )

    expect(createResponse.errors).toBeUndefined()
    expect(createResponse.data?.createNotificationSubscription).toMatchObject({
      email,
      id: subscriptionID,
      targetCollection: 'jobs',
      targetID: job.id,
    })
    createdDocumentIDs['notification-subscriptions'].push(subscriptionID)

    const subscriptions = await payload.find({
      collection: 'notification-subscriptions',
      depth: 0,
      limit: 10,
      where: {
        id: {
          equals: subscriptionID,
        },
      },
    })

    expect(subscriptions.docs).toHaveLength(1)
    createdDocumentIDs.subscribers.push(String(subscriptions.docs[0].subscriber))

    const readResponse = await runGraphQLOperation(listNotificationSubscriptionsQuery(email))

    expect(readResponse.errors).toBeUndefined()
    expect(readResponse.data?.notificationSubscriptions).toMatchObject({
      totalDocs: 0,
      docs: [],
    })

    const deleteResponse = await runGraphQLOperation(
      deleteNotificationSubscriptionMutation(subscriptionID),
    )

    expect(deleteResponse.errors).toBeUndefined()
    expect(deleteResponse.data?.deleteNotificationSubscription).toMatchObject({
      id: subscriptionID,
    })

    createdDocumentIDs['notification-subscriptions'] = []
    createdDocumentIDs.subscribers = []
  })

  it('requires the matching authenticated user for linked emails and populates isSubscribed on jobs, identities, and products', async () => {
    if (bootstrapError || !payload) {
      return
    }

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
    createdDocumentIDs.identities.push(identity.id)

    const company = await payload.create({
      collection: 'companies',
      data: {
        _status: 'published',
        createdBy: 'system',
        description: 'Company for linked-user notifications.',
        email: 'linked-company@example.com',
        identity: identity.id,
        name: 'Subscribed Company',
        website: 'https://example.com/subscribed-company',
      },
      draft: false,
    })
    createdDocumentIDs.companies.push(company.id)

    const job = await payload.create({
      collection: 'jobs',
      data: {
        _status: 'published',
        company: company.id,
        createdBy: 'system',
        description: 'Linked-user job description.',
        employmentType: 'full-time',
        positions: 1,
        postedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        title: 'Subscribed Job',
      },
      draft: false,
    })
    createdDocumentIDs.jobs.push(job.id)

    const product = await payload.create({
      collection: 'products',
      data: {
        _status: 'published',
        company: company.id,
        name: 'Subscribed Product',
      },
      draft: false,
    })
    createdDocumentIDs.products.push(product.id)

    const linkedUser = await createLinkedUser(`linked-${Date.now()}@example.com`)

    await expect(
      payload.create({
        collection: 'notification-subscriptions',
        data: {
          email: linkedUser.email,
          targetCollection: 'jobs',
          targetID: job.id,
        },
        overrideAccess: false,
      }),
    ).rejects.toThrow()

    const jobSubscription = await payload.create({
      collection: 'notification-subscriptions',
      data: {
        email: linkedUser.email,
        targetCollection: 'jobs',
        targetID: job.id,
      },
      overrideAccess: false,
      user: linkedUser,
    })
    createdDocumentIDs['notification-subscriptions'].push(jobSubscription.id)
    createdDocumentIDs.subscribers.push(String(jobSubscription.subscriber))

    const identitySubscription = await payload.create({
      collection: 'notification-subscriptions',
      data: {
        email: linkedUser.email,
        targetCollection: 'identities',
        targetID: identity.id,
      },
      overrideAccess: false,
      user: linkedUser,
    })
    createdDocumentIDs['notification-subscriptions'].push(identitySubscription.id)

    const productSubscription = await payload.create({
      collection: 'notification-subscriptions',
      data: {
        email: linkedUser.email,
        targetCollection: 'products',
        targetID: product.id,
      },
      overrideAccess: false,
      user: linkedUser,
    })
    createdDocumentIDs['notification-subscriptions'].push(productSubscription.id)

    const readableSubscriptions = await payload.find({
      collection: 'notification-subscriptions',
      depth: 0,
      limit: 10,
      overrideAccess: false,
      user: linkedUser,
      where: {
        email: {
          equals: linkedUser.email,
        },
      },
    })

    expect(readableSubscriptions.docs).toHaveLength(3)

    const publicJob = await payload.findByID({
      collection: 'jobs',
      id: job.id,
      depth: 0,
      overrideAccess: false,
    })

    expect(publicJob.isSubscribed).toBe(false)

    const subscribedJob = await payload.findByID({
      collection: 'jobs',
      id: job.id,
      depth: 0,
      overrideAccess: false,
      user: linkedUser,
    })

    expect(subscribedJob.isSubscribed).toBe(true)

    const subscribedIdentity = await payload.findByID({
      collection: 'identities',
      id: identity.id,
      depth: 0,
      overrideAccess: false,
      user: linkedUser,
    })

    expect(subscribedIdentity.isSubscribed).toBe(true)

    const subscribedProduct = await payload.findByID({
      collection: 'products',
      id: product.id,
      depth: 0,
      overrideAccess: false,
      user: linkedUser,
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
        'https://frontend.example.com/unsubscribe?type=Identities&id=tribe-123&email=tribe@example.com',
    })

    expect(email.html).toContain('https://frontend.example.com/tribes/tribe-123')
    expect(email.text).toContain('https://frontend.example.com/tribes/tribe-123')
    expect(email.html).not.toContain('/admin/collections/identities/tribe-123')
    expect(email.text).not.toContain('/admin/collections/identities/tribe-123')
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
    createdDocumentIDs.identities.push(identity.id)

    const subscriptionEmail = `tribe-published-company-${Date.now()}@example.com`
    const subscription = await payload.create({
      collection: 'notification-subscriptions',
      data: {
        email: subscriptionEmail,
        targetCollection: 'identities',
        targetID: identity.id,
      },
      overrideAccess: false,
    })
    createdDocumentIDs['notification-subscriptions'].push(subscription.id)

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
        identity: identity.id,
        name: 'Fresh Company',
        website: 'https://example.com/fresh-company',
      },
      draft: false,
    })
    createdDocumentIDs.companies.push(company.id)

    expect(sendEmailSpy).toHaveBeenCalledTimes(1)

    const sentEmail = sendEmailSpy.mock.calls[0]?.[0]

    expect(sentEmail?.to).toBe(subscriptionEmail)
    expect(sentEmail?.subject).toBe('New Company: Fresh Company')
    expect(sentEmail?.html).toContain(`https://frontend.example.com/companies/${company.id}`)
    expect(sentEmail?.text).toContain(`https://frontend.example.com/companies/${company.id}`)
    expect(sentEmail?.html).toContain(
      `type=Identities&id=${identity.id}&email=${encodeURIComponent(subscriptionEmail)}`,
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
    createdDocumentIDs.identities.push(identity.id)

    const company = await payload.create({
      collection: 'companies',
      data: {
        _status: 'published',
        createdBy: 'system',
        description: 'Company with subscribers.',
        email: 'subscribed-company@example.com',
        identity: identity.id,
        name: 'Subscriber Company',
        website: 'https://example.com/subscriber-company',
      },
      draft: false,
    })
    createdDocumentIDs.companies.push(company.id)

    const subscriptionEmail = `company-published-items-${Date.now()}@example.com`
    const subscription = await payload.create({
      collection: 'notification-subscriptions',
      data: {
        email: subscriptionEmail,
        targetCollection: 'companies',
        targetID: company.id,
      },
      overrideAccess: false,
    })
    createdDocumentIDs['notification-subscriptions'].push(subscription.id)

    const subscriberID = getRelationshipID(subscription.subscriber)
    if (subscriberID) {
      createdDocumentIDs.subscribers.push(subscriberID)
    }

    const job = await payload.create({
      collection: 'jobs',
      data: {
        _status: 'published',
        company: company.id,
        createdBy: 'system',
        description: 'Newly published job.',
        employmentType: 'full-time',
        positions: 1,
        postedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        title: 'Fresh Job',
      },
      draft: false,
    })
    createdDocumentIDs.jobs.push(job.id)

    const startup = await payload.create({
      collection: 'startups',
      data: {
        _status: 'published',
        company: company.id,
        createdBy: 'system',
        description: 'Newly published venture.',
        identity: identity.id,
        stage: 'idea',
        title: 'Fresh Venture',
      },
      draft: false,
    })
    createdDocumentIDs.startups.push(startup.id)

    const product = await payload.create({
      collection: 'products',
      data: {
        company: company.id,
        name: 'Draft Product',
      },
      draft: true,
    })
    createdDocumentIDs.products.push(product.id)

    expect(sendEmailSpy).toHaveBeenCalledTimes(2)

    await payload.update({
      collection: 'products',
      id: product.id,
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
    expect(htmlBodies.some((html) => html.includes(`https://frontend.example.com/jobs/${job.id}`))).toBe(true)
    expect(
      htmlBodies.some((html) => html.includes(`https://frontend.example.com/ventures/${startup.id}`)),
    ).toBe(true)
    expect(
      htmlBodies.some((html) =>
        html.includes(`https://frontend.example.com/products-services/${product.id}`),
      ),
    ).toBe(true)
    expect(
      htmlBodies.every((html) =>
        html.includes(
          `type=Companies&id=${company.id}&email=${encodeURIComponent(subscriptionEmail)}`,
        ),
      ),
    ).toBe(true)
  })
})
