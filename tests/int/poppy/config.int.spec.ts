// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildCompany } from '@datalayer/personal-agent-protocol/server'
import {
  listsResource,
  parseDiscoveryDocument,
  parseOAuthServerMetadata,
} from '@datalayer/personal-agent-protocol'
import { createPoppyConfig } from '@/poppy/config/utils'

describe('Configured Poppy frontend ownership', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('publishes the explicitly configured frontend alias under the backend issuer', () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://backend.example')
    vi.stubEnv('NEXT_PUBLIC_FRONTEND_URL', 'https://frontend.example')
    const service = buildCompany(createPoppyConfig())
    const document = parseDiscoveryDocument(service.discoveryDocument('frontend.example'))
    expect(document.organization.domain).toBe('frontend.example')
    expect(document.auth?.issuer).toBe('https://backend.example')
    expect(
      listsResource(parseOAuthServerMetadata(service.oauthMetadata()), 'frontend.example'),
    ).toBe(true)
    expect(service.domainResourceMetadata('frontend.example').resource).toBe(
      'https://frontend.example',
    )
    expect(() => service.discoveryDocument('attacker.example')).toThrow()
  })

  it('does not treat OAuth client redirects or insecure origins as owned frontend aliases', () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://backend.example')
    vi.stubEnv('NEXT_PUBLIC_FRONTEND_URL', '')
    vi.stubEnv('OIDC_REDIRECT_URLS', 'https://attacker.example/callback')
    expect(createPoppyConfig().aliases).toEqual([])
    vi.stubEnv('NEXT_PUBLIC_FRONTEND_URL', 'http://frontend.example')
    expect(createPoppyConfig().aliases).toEqual([])
    vi.stubEnv('NEXT_PUBLIC_FRONTEND_URL', 'https://frontend.example:8443')
    expect(createPoppyConfig().aliases).toEqual([])
  })

  it('uses the shared frontend URL for links and rejects an absent frontend alias', async () => {
    const { getFrontendURL } = await import('@/utilities/getURL')
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://backend.example')
    vi.stubEnv('NEXT_PUBLIC_FRONTEND_URL', 'https://frontend.example')
    const service = buildCompany(createPoppyConfig())
    expect(parseDiscoveryDocument(service.discoveryDocument('frontend.example')).auth?.issuer).toBe(
      'https://backend.example',
    )
    expect(
      listsResource(parseOAuthServerMetadata(service.oauthMetadata()), 'frontend.example'),
    ).toBe(true)
    expect(getFrontendURL()).toBe('https://frontend.example')
    expect(createPoppyConfig().aliases).toEqual(['frontend.example'])
    vi.stubEnv('NEXT_PUBLIC_FRONTEND_URL', '')
    expect(createPoppyConfig().aliases).toEqual([])
  })
})
