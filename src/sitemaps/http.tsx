import { after } from 'next/server'
import { SITEMAP_TTL_MS } from './constants'
import { refreshSitemaps } from './service'
import { getSitemapCacheDirectory, readSitemapManifest } from './utils'

export const readRequestedSitemapManifest = async () => {
  const directory = getSitemapCacheDirectory()
  const manifest = await readSitemapManifest(directory)
  if (!manifest || Date.now() - Date.parse(manifest.generatedAt) >= SITEMAP_TTL_MS) {
    after(async () => {
      try {
        await refreshSitemaps(async () => {
          const [{ getPayload }, { default: config }, { createSitemapSource }] = await Promise.all([
            import('payload'),
            import('@payload-config'),
            import('./payload'),
          ])
          return createSitemapSource(await getPayload({ config }))
        }, directory)
      } catch (error) {
        console.error('[sitemaps] Request-triggered refresh failed; serving previous files', error)
      }
    })
  }
  return manifest
}
