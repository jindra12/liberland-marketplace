import type { CollectionConfig, Config, GlobalConfig } from 'payload'

const USER_VISIBLE_SLUGS = ['companies', 'jobs', 'identities', 'products']

const hideForNonAdmin = ({ user }: { user: any }) => !user?.role?.includes('admin')

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
        hidden: hideForNonAdmin,
      },
    }
  }),
  globals: (config.globals ?? []).map((global: GlobalConfig) => {
    if (global.admin?.hidden === true) return global

    return {
      ...global,
      admin: {
        ...global.admin,
        hidden: hideForNonAdmin,
      },
    }
  }),
})
