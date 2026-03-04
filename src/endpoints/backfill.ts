import type { Endpoint } from 'payload'

const BATCH_SIZE = 50

const COLLECTIONS_WITH_DRAFTS = new Set(['jobs', 'companies', 'startups'])

export const backfillEndpoint: Endpoint = {
  path: '/backfill',
  method: 'post',
  handler: async (req) => {
    if (!req.user?.role?.includes('admin')) {
      return Response.json({ error: 'Admin access required' }, { status: 403 })
    }

    const results: Record<string, number> = {}

    // 1. Backfill completenessScore by re-saving docs (triggers beforeChange hooks)
    const collectionsToResave: Array<'jobs' | 'products' | 'companies' | 'startups'> = [
      'jobs',
      'products',
      'companies',
      'startups',
    ]

    for (const slug of collectionsToResave) {
      let updated = 0
      let hasMore = true
      let page = 1
      const hasDrafts = COLLECTIONS_WITH_DRAFTS.has(slug)

      while (hasMore) {
        const found = await req.payload.find({
          collection: slug,
          limit: BATCH_SIZE,
          page,
          depth: 0,
          overrideAccess: true,
          ...(hasDrafts ? { draft: true } : {}),
          req,
        })

        for (const doc of found.docs) {
          try {
            await req.payload.update({
              collection: slug,
              id: doc.id,
              data: {},
              overrideAccess: true,
              ...(hasDrafts ? { draft: true } : {}),
              req,
            })
            updated++
          } catch (e) {
            req.payload.logger.error(`Backfill: failed to update ${slug}/${doc.id}: ${e}`)
          }
        }

        hasMore = found.hasNextPage
        page++
      }

      results[`${slug}_resaved`] = updated
    }

    // 2. Backfill itemCount for all identities
    let identitiesUpdated = 0
    let hasMore = true
    let page = 1

    while (hasMore) {
      const found = await req.payload.find({
        collection: 'identities',
        limit: BATCH_SIZE,
        page,
        depth: 0,
        overrideAccess: true,
        req,
      })

      for (const identity of found.docs) {
        const id = identity.id.toString()

        const [jobCount, productCount, companyCount, startupCount] = await Promise.all([
          req.payload
            .count({
              collection: 'jobs',
              where: {
                companyIdentityId: { equals: id },
                _status: { equals: 'published' },
              },
              req,
            })
            .then((r) => r.totalDocs),
          req.payload
            .count({
              collection: 'products',
              where: { companyIdentityId: { equals: id } },
              req,
            })
            .then((r) => r.totalDocs),
          req.payload
            .count({
              collection: 'companies',
              where: { identity: { equals: id } },
              req,
            })
            .then((r) => r.totalDocs),
          req.payload
            .count({
              collection: 'startups',
              where: { identity: { equals: id } },
              req,
            })
            .then((r) => r.totalDocs),
        ])

        await req.payload.update({
          collection: 'identities',
          id: identity.id,
          data: { itemCount: jobCount + productCount + companyCount + startupCount },
          overrideAccess: true,
          req,
        })
        identitiesUpdated++
      }

      hasMore = found.hasNextPage
      page++
    }

    results.identities_updated = identitiesUpdated

    return Response.json({ success: true, results })
  },
}
