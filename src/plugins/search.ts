import { searchPlugin } from '@payloadcms/plugin-search'
import { searchFields } from '@/search/fieldOverrides'
import { beforeSyncWithSearch } from '@/search/beforeSync'

export const marketplaceSearchPlugin = searchPlugin({
  collections: ['jobs', 'companies', 'identities', 'products', 'startups', 'posts'],
  beforeSync: beforeSyncWithSearch,
  searchOverrides: {
    fields: ({ defaultFields }) => [...defaultFields, ...searchFields],
    admin: { group: 'Directory' },
  },
})
