import { searchPlugin } from '@payloadcms/plugin-search'
import { searchFields } from '@/search/fieldOverrides'
import { beforeSyncWithSearch } from '@/search/beforeSync'
import { indexedCollections } from '@/search/constants'
import { normalizeSearchQuery } from '@/search/utils'

export const marketplaceSearchPlugin = searchPlugin({
  collections: [...indexedCollections],
  beforeSync: beforeSyncWithSearch,
  searchOverrides: {
    fields: ({ defaultFields }) => [...defaultFields, ...searchFields],
    admin: { group: 'Directory' },
    hooks: { beforeOperation: [normalizeSearchQuery] },
  },
})
