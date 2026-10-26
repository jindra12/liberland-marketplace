import { readRequestedSitemapManifest } from '@/sitemaps/http'
import { SITEMAP_TTL_MS } from '@/sitemaps/constants'
import { limitBackendRequest } from '@/security/utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

export const GET = async (request: Request): Promise<Response> => {
  const limited = await limitBackendRequest(request)
  if (limited) {
    return limited
  }
  try {
    const manifest = await readRequestedSitemapManifest()
    if (!manifest) {
      return Response.json(
        { error: 'Sitemap snapshot is being generated. Retry shortly.' },
        { status: 503, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } },
      )
    }
    const stale = Date.now() - Date.parse(manifest.generatedAt) >= SITEMAP_TTL_MS
    return Response.json(manifest, {
      headers: {
        'Cache-Control': 'public, max-age=3600, stale-if-error=604800',
        'X-Sitemap-Cache': stale ? 'stale' : 'fresh',
      },
    })
  } catch (error) {
    console.error('[sitemaps] Cannot read cached manifest', error)
    return Response.json(
      { error: 'Cached sitemap is unavailable.' },
      { status: 503, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } },
    )
  }
}
