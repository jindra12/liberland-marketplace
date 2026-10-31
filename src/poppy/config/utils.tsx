import { CompanyConfig } from '@datalayer/personal-agent-protocol/server'
import { POPPY_SCOPE_DESCRIPTIONS, POPPY_WRITE_SCOPES } from '../constants'

export const createPoppyConfig = () => {
  if (!process.env.NEXT_PUBLIC_SERVER_URL) {
    throw new Error('NEXT_PUBLIC_SERVER_URL is required for Poppy')
  }
  const backend = new URL(process.env.NEXT_PUBLIC_SERVER_URL)
  if (backend.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    throw new Error('Poppy requires an HTTPS NEXT_PUBLIC_SERVER_URL in production')
  }
  const frontend = process.env.FRONTEND_URL ? new URL(process.env.FRONTEND_URL) : undefined
  const aliases =
    frontend?.protocol === 'https:' && !frontend.port && frontend.hostname !== backend.hostname
      ? [frontend.hostname]
      : []
  return new CompanyConfig({
    name: 'Nswap Marketplace',
    domain: backend.host,
    aliases,
    scopes: Object.keys(POPPY_SCOPE_DESCRIPTIONS),
    scopeDescriptions: POPPY_SCOPE_DESCRIPTIONS,
    writeScopes: POPPY_WRITE_SCOPES,
    scopeHints: {
      'marketplace:read': ['none', false],
      'marketplace:write': ['irreversible', false],
      'account:read': ['none', true],
      'account:write': ['irreversible', true],
    },
    direct: true,
    device: false,
    operations: false,
    feedback: false,
    web: false,
    accessTokenLifetimeSeconds: 3600,
    refreshTokenLifetimeSeconds: 90 * 24 * 3600,
  })
}
