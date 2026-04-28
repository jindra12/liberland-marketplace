import { describe, expect, it } from 'vitest'

import { GET } from '@/app/(frontend)/deploy-space/route'

describe('deploy-space route', () => {
  it('rewrites the default server URL to the serving origin', async () => {
    const response = await GET(new Request('https://mirror.example.com/deploy-space'))
    const script = await response.text()

    expect(response.headers.get('content-type')).toBe('text/x-shellscript; charset=utf-8')
    expect(script).toContain('SERVER_URL="${SERVER_URL:-https://mirror.example.com}"')
  })
})
