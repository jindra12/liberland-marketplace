import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockDeep } from 'vitest-mock-extended'
import type { PayloadRequest } from 'payload'
import { ventureTestRpcEndpoint } from '@/endpoints/ventureChainIndex'

describe('Public test RPC method boundaries', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    { method: 'hardhat_reset', params: [] },
    {
      method: 'hardhat_setBalance',
      params: ['0x1111111111111111111111111111111111111111', '0x0'],
    },
  ])('does not forward anonymous node administration: $method', async (input) => {
    const req = mockDeep<PayloadRequest>()
    req.user = null
    req.json = async () => ({ jsonrpc: '2.0', id: 1, ...input })
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ jsonrpc: '2.0', id: 1, result: true }))
    vi.stubGlobal('fetch', fetch)

    await ventureTestRpcEndpoint.handler(req)

    // No node is contacted, including when the local fork happens to be running.
    expect(fetch).not.toHaveBeenCalled()
  })

  it('continues forwarding a public chain identifier query to the fixed test node', async () => {
    const body = { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }
    const req = mockDeep<PayloadRequest>()
    req.user = null
    req.json = async () => body
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ jsonrpc: '2.0', id: 1, result: '0x7a69' }))
    vi.stubGlobal('fetch', fetch)

    const response = await ventureTestRpcEndpoint.handler(req)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ jsonrpc: '2.0', id: 1, result: '0x7a69' })
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8545',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(body) }),
    )
  })
})
