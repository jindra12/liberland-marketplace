import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import { GET } from '@/app/(frontend)/deploy-space/route'

vi.mock('node:fs/promises', () => ({ default: { readFile: vi.fn() } }))

describe('Downloaded installer authority', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('uses the configured backend rather than a request-controlled origin in executable defaults', async () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://backend.example')
    vi.mocked(fs.readFile).mockResolvedValue('SERVER_URL="${SERVER_URL:-https://backend.nswap.io}"')
    const response = await GET(new Request('https://untrusted.example/deploy-space'))
    expect(await response.text()).toContain('SERVER_URL="${SERVER_URL:-https://backend.example}"')
  })

  it('does not publicly cache an origin-dependent executable installer', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('#!/bin/bash\n')
    const response = await GET(new Request('https://backend.example/deploy-space'))
    expect(response.headers.get('cache-control')).toMatch(/no-store|private/)
  })
})
