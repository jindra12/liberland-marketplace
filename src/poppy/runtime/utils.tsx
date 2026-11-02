import config from '@payload-config'
import { getPayload } from 'payload'
import { contribution, definePlugin } from '@datalayer/reactor'
import {
  buildCompany,
  CompanyAccounts,
  CompanyAgents,
  CompanyMcps,
  CompanyStores,
  SignInRefused,
  type CompanyService,
} from '@datalayer/personal-agent-protocol/server'
import { createPoppyConfig } from '../config/utils'
import { openPoppyStore } from '../store/utils'
import { createPoppyMcp } from '../mcp/utils'
import { findPoppyAccount } from '../accounts/utils'

const services = new Map<string, Promise<CompanyService>>()

const createService = async () => {
  const settings = createPoppyConfig()
  const payload = await getPayload({ config })
  const store = await openPoppyStore(payload)
  const mcp = await createPoppyMcp(payload)
  return buildCompany(settings, {
    plugins: [
      definePlugin({
        name: 'nswap.poppy',
        version: '1.0.0',
        contributes: [
          contribution(CompanyStores, store),
          contribution(CompanyAccounts, {
            authenticate: async () => {
              throw new SignInRefused()
            },
            checkCode: async () => false,
            signedOutBefore: async (accountId) => {
              const user = await findPoppyAccount(payload, accountId)
              if (!user) {
                return new Date()
              }
              const security = await store.get('account_security', accountId)
              return typeof security?.value.signedOutBefore === 'string'
                ? new Date(security.value.signedOutBefore)
                : undefined
            },
          }),
          contribution(CompanyMcps, mcp),
          contribution(CompanyAgents, {
            respond: async () => [
              {
                text: 'This is an independent Nswap backend. Use MCP to discover schemas, search, shop and manage permitted account data. Sign in through company browser consent for account actions; no password or token belongs in chat.',
                data: {
                  mcp: settings.mcpUrl,
                  issuer: settings.base,
                  scopes: settings.scopeDescriptions,
                },
              },
            ],
          }),
        ],
      }),
    ],
  })
}

export const getPoppyService = async (): Promise<CompanyService> => {
  const key = createPoppyConfig().base
  const existing = services.get(key)
  if (existing) {
    return existing
  }
  const pending = createService()
  services.set(key, pending)
  try {
    return await pending
  } catch (error) {
    services.delete(key)
    throw error
  }
}
