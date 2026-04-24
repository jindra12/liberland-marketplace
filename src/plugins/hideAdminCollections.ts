import type { CollectionConfig, Config, GlobalConfig } from 'payload'

const USER_VISIBLE_SLUGS = ['companies', 'jobs', 'identities', 'products', 'startups', 'search']

export const hideAdminCollections = (config: Config): Config => ({
  ...config,
  collections: (config.collections ?? []).map((collection: CollectionConfig) => {
    if (collection.slug === 'users') return collection
    if (USER_VISIBLE_SLUGS.includes(collection.slug)) return collection
    if (collection.admin?.hidden === true) return collection

    return {
      ...collection,
      admin: {
        ...collection.admin,
        hidden: ({ user }) => !user?.role?.includes('admin'),
      },
    }
  }),
  globals: (config.globals ?? []).map((global: GlobalConfig) => {
    if (global.admin?.hidden === true) return global

    return {
      ...global,
      admin: {
        ...global.admin,
        hidden: ({ user }) => !user?.role?.includes('admin'),
      },
    }
  }),
})
