import { describe, expect, it, vi } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'
import type {
  CollectionBeforeChangeHook,
  Config,
  PaginatedDocs,
  Payload,
  PayloadRequest,
} from 'payload'
import type { Company, OauthAccessToken, User } from '@/payload-types'
import { requireOwnCompany } from '@/hooks/requireOwnCompany'
import { addOIDCTokenStrategy } from '@/plugins/oidcTokenStrategy'
import { MARKETPLACE_ACCESS_SCOPE } from '@/security/constants'

vi.mock('@/mcp/server', () => ({ createBackendMcpServer: vi.fn() }))
vi.mock('@/mcp/graphql', () => ({ withMcpAccountRequest: vi.fn() }))
vi.mock('@/poppy/accounts/utils', () => ({ findPoppyAccount: vi.fn() }))

import { requiredPoppyScope } from '@/poppy/mcp/utils'

describe('Authorization boundaries', () => {
  it.each(['orders', 'carts', 'users'])(
    'related %s reads require private-account consent',
    (relatedEntity) => {
      expect(
        requiredPoppyScope('find_related_entities', { entity: 'companies', relatedEntity }),
      ).toBe('account:read')
    },
  )

  it.each(['authors', 'createdBy'] as const)(
    'supplied %s cannot impersonate a company owner',
    async (field) => {
      const req = mockDeep<PayloadRequest>()
      req.user = mock<User & { collection: 'users' }>({
        id: 'mallory',
        role: ['user'],
        collection: 'users',
      })
      // The DB contains Alice's company. Return it only for the actual vulnerable owner filter.
      req.payload.find.mockImplementation(async (options) =>
        mock<PaginatedDocs<Company>>({
          docs: [],
          totalDocs: options.where?.and?.some(
            (clause) => !Array.isArray(clause.createdBy) && clause.createdBy?.equals === 'alice',
          )
            ? 1
            : 0,
        }),
      )
      const args = Object.assign(mock<Parameters<CollectionBeforeChangeHook>[0]>(), {
        req,
        operation: 'create',
        data: { company: 'alice-company', [field]: field === 'authors' ? ['alice'] : 'alice' },
      })
      await expect(requireOwnCompany(args)).rejects.toThrow('companies you own')
    },
  )

  it.each([
    {
      label: 'banned account',
      banned: true,
      scopes: [MARKETPLACE_ACCESS_SCOPE],
      expiresAt: '2099-01-01T00:00:00Z',
      accepted: false,
    },
    {
      label: 'identity-only token',
      banned: false,
      scopes: ['openid'],
      expiresAt: '2099-01-01T00:00:00Z',
      accepted: false,
    },
    {
      label: 'active consented account',
      banned: false,
      scopes: [MARKETPLACE_ACCESS_SCOPE],
      expiresAt: '2099-01-01T00:00:00Z',
      accepted: true,
    },
    {
      label: 'expired token',
      banned: false,
      scopes: [MARKETPLACE_ACCESS_SCOPE],
      expiresAt: '2000-01-01T00:00:00Z',
      accepted: false,
    },
    {
      label: 'malformed expiry',
      banned: false,
      scopes: [MARKETPLACE_ACCESS_SCOPE],
      expiresAt: 'not-a-date',
      accepted: false,
    },
  ])('enforces delegation scope, status and expiry for $label', async (scenario) => {
    const payload = mockDeep<Payload>()
    payload.find.mockResolvedValue(
      mock<PaginatedDocs<OauthAccessToken>>({
        docs: [
          mock<OauthAccessToken>({
            user: 'mallory',
            accessTokenExpiresAt: scenario.expiresAt,
            scopes: scenario.scopes.join(' '),
          }),
        ],
      }),
    )
    payload.findByID.mockResolvedValue(
      mock<User>({ id: 'mallory', role: ['user'], banned: scenario.banned }),
    )
    const config = addOIDCTokenStrategy(
      Object.assign(mock<Config>(), { collections: [{ slug: 'users', fields: [], auth: true }] }),
    )
    const auth = config.collections?.[0]?.auth
    if (!auth || typeof auth !== 'object' || !auth.strategies?.[0]) {
      throw new Error('The actual OIDC strategy was not installed.')
    }
    const result = await auth.strategies[0].authenticate({
      headers: new Headers({ authorization: 'Bearer fixture-access-token' }),
      payload,
      isGraphQL: false,
    })
    expect(result).toMatchObject({ user: scenario.accepted ? { id: 'mallory' } : null })
  })
})
