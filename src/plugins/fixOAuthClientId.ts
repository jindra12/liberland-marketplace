import type { Field, Plugin } from 'payload'

/** OAuth references the application's public clientId, not its Payload document ID. */
export const fixOAuthClientId: Plugin = (config) => ({
  ...config,
  collections: (config.collections || []).map((collection) => {
    if (collection.slug !== 'oauthAccessTokens' && collection.slug !== 'oauthConsents') {
      return collection
    }
    return {
      ...collection,
      fields: collection.fields.map((field): Field => {
        if (field.type !== 'relationship' || field.name !== 'client') {
          return field
        }
        return {
          name: field.name,
          type: 'text',
          required: field.required,
          index: true,
          admin: { hidden: field.admin?.hidden, readOnly: field.admin?.readOnly },
          access: field.access,
          custom: field.custom,
        }
      }),
    }
  }),
})
