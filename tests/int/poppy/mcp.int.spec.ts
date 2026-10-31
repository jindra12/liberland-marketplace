// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import type { CompanyMcp } from '@datalayer/personal-agent-protocol/server'
import { createPoppyMcp, requiredPoppyScope } from '@/poppy/mcp/utils'
import { revokePoppyAccountGrants } from '@/poppy/accounts/utils'
import { openPoppyStore } from '@/poppy/store/utils'

const accounts: string[] = []
const holder: { payload?: Payload; mcp?: CompanyMcp } = {}
const callContext = (accountId: string, scopes: string[]) => ({
  method: 'TOOL',
  path: '',
  query: {},
  body: {},
  accountId,
  scopes,
  clientId: 'https://agent.example/agent.json',
})

describe('Poppy access through existing Payload MCP tools', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('127.0.0.1:27018/poppy_payload_test')) {
      throw new Error(
        'Run this test only with the isolated poppy_payload_test database on port 27018',
      )
    }
    const [{ getPayload }, config] = await Promise.all([
      import('payload'),
      import('@/payload.config'),
    ])
    holder.payload = await getPayload({ config: config.default })
    holder.mcp = await createPoppyMcp(holder.payload)
    // Leave the first-user administrator separate from the ordinary test accounts.
    await holder.payload.create({
      collection: 'users',
      data: {
        name: 'Test bootstrap',
        email: `bootstrap-${crypto.randomUUID()}@example.com`,
        emailVerified: false,
      },
    })
    const users = await Promise.all(
      ['Alice', 'Bob'].map((name) =>
        holder.payload!.create({
          collection: 'users',
          data: {
            name,
            email: `${name}-${crypto.randomUUID()}@example.com`,
            emailVerified: false,
            phone: name,
          },
        }),
      ),
    )
    accounts.push(...users.map((user) => user.id))
  })

  afterAll(async () => {
    await holder.payload?.destroy()
  })

  it('persists password-reset revocation without starting a Poppy service', async () => {
    const before = Date.now()
    await revokePoppyAccountGrants(accounts[0])
    const store = await openPoppyStore(holder.payload!)
    const marker = await store.get('account_security', accounts[0])
    expect(typeof marker?.value.signedOutBefore).toBe('string')
    expect(Date.parse(String(marker?.value.signedOutBefore))).toBeGreaterThanOrEqual(before)
  })

  it('keeps concurrent callers in separate native GraphQL user contexts', async () => {
    const responses = await Promise.all(
      accounts.map((accountId) =>
        holder.mcp!.call(
          'get_entity',
          { entity: 'users', id: accountId },
          callContext(accountId, ['account:read']),
        ),
      ),
    )
    expect(responses[0].isError).toBe(false)
    expect(responses[0].text).toContain(accounts[0])
    expect(responses[0].text).not.toContain(accounts[1])
    expect(responses[1].text).toContain(accounts[1])
    expect(responses[1].text).not.toContain(accounts[0])
  })

  it('does not let Alice read Bob or use marketplace-only permission to update private user fields', async () => {
    const response = await holder.mcp!.call(
      'get_entity',
      { entity: 'users', id: accounts[1] },
      callContext(accounts[0], ['account:read']),
    )
    expect(response.isError || !response.text?.includes(accounts[1])).toBeTruthy()
    const denied = await holder.mcp!.call(
      'update_entity',
      { entity: 'users', id: accounts[0], data: { phone: 'Changed' }, confirmation: true },
      callContext(accounts[0], ['marketplace:write']),
    )
    expect(denied.refusal?.[2]).toBe('account:write')
    expect((await holder.payload!.findByID({ collection: 'users', id: accounts[0] })).phone).toBe(
      'Alice',
    )
  })

  it('rejects unconfirmed writes and honors account-write permission without giving admin privileges', async () => {
    const context = callContext(accounts[0], ['account:write'])
    const data = { entity: 'users', id: accounts[0], data: { phone: 'Confirmed change' } }
    expect((await holder.mcp!.call('update_entity', data, context)).isError).toBe(true)
    const confirmed = await holder.mcp!.call(
      'update_entity',
      { ...data, confirmation: true },
      context,
    )
    expect(confirmed.isError, confirmed.text).toBe(false)
    expect((await holder.payload!.findByID({ collection: 'users', id: accounts[0] })).phone).toBe(
      'Confirmed change',
    )
    const other = await holder.mcp!.call(
      'update_entity',
      { ...data, id: accounts[1], confirmation: true },
      context,
    )
    expect(other.isError).toBe(true)
    expect((await holder.payload!.findByID({ collection: 'users', id: accounts[1] })).phone).toBe(
      'Bob',
    )
  })

  it('does not treat a pairwise user ID or banned account as an authorization grant', async () => {
    const anonymous = {
      method: 'TOOL',
      path: '',
      query: {},
      body: {},
      scopes: ['account:read'],
      clientId: 'https://agent.example/agent.json',
    }
    expect((await holder.mcp!.call('wallet_capabilities', {}, anonymous)).refusal?.[0]).toBe(403)
    await holder.payload!.update({
      collection: 'users',
      id: accounts[1],
      data: { banned: true },
      overrideAccess: true,
    })
    expect(
      (
        await holder.mcp!.call(
          'get_entity',
          { entity: 'users', id: accounts[1] },
          callContext(accounts[1], ['account:read']),
        )
      ).isError,
    ).toBe(true)
    expect(requiredPoppyScope('get_entity', { entity: 'companies' })).toBeUndefined()
    expect(requiredPoppyScope('delete_entity', { entity: 'orders' })).toBe('account:write')
  })
})
