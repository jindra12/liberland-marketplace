import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import type { User } from '@/payload-types'

let payload: Payload | null = null
let bootstrapError: Error | null = null
let graphqlPost: ((request: Request) => Promise<Response>) | null = null

const createdCompanyIDs: string[] = []
const createdOauthAccessTokenIDs: string[] = []
const createdUserIDs: string[] = []

type WalletChain = 'ethereum' | 'solana' | 'tron'

type WalletInput = {
  address: string
  chain: WalletChain
  provider: string
}

type ShippingAddressInput = {
  addressLine1: string
  addressLine2: string
  city: string
  company: string
  country: string
  firstName: string
  lastName: string
  phone: string
  postalCode: string
  state: string
  title: string
}

type UpdateUserDataInput = {
  phone?: string
  shippingAddress?: ShippingAddressInput
  wallets?: WalletInput[]
}

type GraphQLVariables = {
  data?: UpdateUserDataInput
  email?: string
}

type GraphQLResponseBody = {
  data?: {
    updateUserByEmail?: {
      id: string
      email: string
      phone?: string | null
      wallets?:
        | Array<{
            address?: string | null
            chain?: WalletChain | null
            provider?: string | null
          }>
        | null
      shippingAddress?: {
        addressLine1?: string | null
        addressLine2?: string | null
        city?: string | null
        company?: string | null
        country?: string | null
        firstName?: string | null
        lastName?: string | null
        phone?: string | null
        postalCode?: string | null
        state?: string | null
        title?: string | null
      } | null
    } | null
    userByEmail?: {
      id: string
      email: string
      phone?: string | null
      wallets?:
        | Array<{
            address?: string | null
            chain?: WalletChain | null
            provider?: string | null
          }>
        | null
      shippingAddress?: {
        addressLine1?: string | null
        addressLine2?: string | null
        city?: string | null
        company?: string | null
        country?: string | null
        firstName?: string | null
        lastName?: string | null
        phone?: string | null
        postalCode?: string | null
        state?: string | null
        title?: string | null
      } | null
    } | null
  }
  errors?: Array<{ message?: string }>
}

const createUser = async (label: string): Promise<User> => {
  if (!payload) {
    throw new Error('Payload is not available.')
  }

  const user = await payload.create({
    collection: 'users',
    data: {
      email: `${label}-${crypto.randomUUID()}@example.com`,
      emailVerified: true,
      name: label,
    },
  })

  createdUserIDs.push(user.id)

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
    createdCompanyIDs.push(company.id)
  })

  return user
}

const createBearerToken = async (user: User): Promise<string> => {
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
      user: user.id,
    },
  })

  createdOauthAccessTokenIDs.push(tokenRecord.id)

  return accessToken
}

const runAuthorizedGraphQLOperation = async ({
  bearerToken,
  query,
  variables,
}: {
  bearerToken: string
  query: string
  variables?: GraphQLVariables
}): Promise<{ body: GraphQLResponseBody; response: Response }> => {
  if (!graphqlPost) {
    throw new Error('GraphQL route is not available.')
  }

  const request = new Request('http://localhost:3001/api/graphql', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${bearerToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })

  const response = await graphqlPost(request)
  const body = (await response.json()) as GraphQLResponseBody

  return { body, response }
}

describe('Users self GraphQL access', () => {
  beforeAll(async () => {
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

  afterEach(async () => {
    if (!payload) {
      return
    }

    for (const id of createdOauthAccessTokenIDs.reverse()) {
      await payload.delete({
        collection: 'oauthAccessTokens',
        id,
      })
    }

    createdOauthAccessTokenIDs.length = 0

    for (const id of createdCompanyIDs.reverse()) {
      await payload.delete({
        collection: 'companies',
        id,
      })
    }

    createdCompanyIDs.length = 0

    for (const id of createdUserIDs.reverse()) {
      await payload.delete({
        collection: 'users',
        id,
      })
    }

    createdUserIDs.length = 0
  })

  it('lets an authenticated user update and read their own profile fields, including wallets, via email-based bearer-token GraphQL', async () => {
    if (bootstrapError || !payload || !graphqlPost) {
      return
    }

    const user = await createUser('Self GraphQL User')
    const bearerToken = await createBearerToken(user)

    const updateMutation = `
      mutation UpdateUserByEmail($email: String!, $data: mutationUserInput!) {
        updateUserByEmail(
          email: $email
          data: $data
        ) {
          id
          email
          phone
          wallets {
            chain
            provider
            address
          }
          shippingAddress {
            title
            firstName
            lastName
            company
            addressLine1
            addressLine2
            city
            state
            postalCode
            country
            phone
          }
        }
      }
    `

    const { body: updateBody, response: updateResponse } = await runAuthorizedGraphQLOperation({
      bearerToken,
      query: updateMutation,
      variables: {
        data: {
          phone: '+1 202 555 0107',
          shippingAddress: {
            title: 'Home',
            firstName: 'Ada',
            lastName: 'Lovelace',
            company: 'Analytical Engines LLC',
            addressLine1: '12 St James Square',
            addressLine2: 'Flat 3',
            city: 'London',
            state: 'Greater London',
            postalCode: 'SW1Y 4LB',
            country: 'GB',
            phone: '+1 202 555 0107',
          },
          wallets: [
            {
              address: '0x1111111111111111111111111111111111111111',
              chain: 'ethereum',
              provider: 'MetaMask',
            },
            {
              address: '4Nd1mYb2E3a7Jm7mWvyaManEXZDV4SSQSSHqzTeWY5Av',
              chain: 'solana',
              provider: 'Phantom',
            },
            {
              address: 'TKfjV9RNKJJCqPvBtK8L7Knykh7DNWvnYt',
              chain: 'tron',
              provider: 'TronLink',
            },
          ],
        },
        email: user.email,
      },
    })

    expect(updateResponse.status).toBe(200)
    expect(updateBody.errors).toBeUndefined()
    expect(updateBody.data?.updateUserByEmail?.id).toBe(user.id)
    expect(updateBody.data?.updateUserByEmail?.email).toBe(user.email)
    expect(updateBody.data?.updateUserByEmail?.phone).toBe('+1 202 555 0107')
    expect(updateBody.data?.updateUserByEmail?.wallets).toEqual([
      {
        address: '0x1111111111111111111111111111111111111111',
        chain: 'ethereum',
        provider: 'MetaMask',
      },
      {
        address: '4Nd1mYb2E3a7Jm7mWvyaManEXZDV4SSQSSHqzTeWY5Av',
        chain: 'solana',
        provider: 'Phantom',
      },
      {
        address: 'TKfjV9RNKJJCqPvBtK8L7Knykh7DNWvnYt',
        chain: 'tron',
        provider: 'TronLink',
      },
    ])
    expect(updateBody.data?.updateUserByEmail?.shippingAddress?.firstName).toBe('Ada')
    expect(updateBody.data?.updateUserByEmail?.shippingAddress?.phone).toBe('+1 202 555 0107')

    const readQuery = `
      query UserByEmail($email: String!) {
        userByEmail(email: $email) {
          id
          email
          phone
          wallets {
            chain
            provider
            address
          }
          shippingAddress {
            title
            firstName
            lastName
            company
            addressLine1
            addressLine2
            city
            state
            postalCode
            country
            phone
          }
        }
      }
    `

    const { body: readBody, response: readResponse } = await runAuthorizedGraphQLOperation({
      bearerToken,
      query: readQuery,
      variables: {
        email: user.email,
      },
    })

    expect(readResponse.status).toBe(200)
    expect(readBody.errors).toBeUndefined()
    expect(readBody.data?.userByEmail).toMatchObject({
      email: user.email,
      id: user.id,
      phone: '+1 202 555 0107',
      wallets: [
        {
          address: '0x1111111111111111111111111111111111111111',
          chain: 'ethereum',
          provider: 'MetaMask',
        },
        {
          address: '4Nd1mYb2E3a7Jm7mWvyaManEXZDV4SSQSSHqzTeWY5Av',
          chain: 'solana',
          provider: 'Phantom',
        },
        {
          address: 'TKfjV9RNKJJCqPvBtK8L7Knykh7DNWvnYt',
          chain: 'tron',
          provider: 'TronLink',
        },
      ],
      shippingAddress: {
        addressLine1: '12 St James Square',
        addressLine2: 'Flat 3',
        city: 'London',
        company: 'Analytical Engines LLC',
        country: 'GB',
        firstName: 'Ada',
        lastName: 'Lovelace',
        phone: '+1 202 555 0107',
        postalCode: 'SW1Y 4LB',
        state: 'Greater London',
        title: 'Home',
      },
    })
  })

  it('rejects wallet addresses that do not match the selected chain via authorized GraphQL update', async () => {
    if (bootstrapError || !payload || !graphqlPost) {
      return
    }

    const user = await createUser('Invalid Wallet GraphQL User')
    const bearerToken = await createBearerToken(user)

    const updateMutation = `
      mutation UpdateUserByEmail($email: String!, $data: mutationUserInput!) {
        updateUserByEmail(
          email: $email
          data: $data
        ) {
          id
          wallets {
            chain
            provider
            address
          }
        }
      }
    `

    const { body, response } = await runAuthorizedGraphQLOperation({
      bearerToken,
      query: updateMutation,
      variables: {
        data: {
          wallets: [
            {
              address: '0x1111111111111111111111111111111111111111',
              chain: 'solana',
              provider: 'Phantom',
            },
          ],
        },
        email: user.email,
      },
    })

    expect(response.status).toBe(200)
    expect(body.errors?.length).toBeGreaterThan(0)
    expect(body.errors?.[0]?.message).toContain('valid Solana address')
  })
})
