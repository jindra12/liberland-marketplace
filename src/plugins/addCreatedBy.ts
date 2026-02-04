import type {
  CollectionBeforeChangeHook,
  CollectionConfig,
  Config,
  Field,
} from 'payload'

const createdByField: Field = {
  name: 'createdBy',
  type: 'relationship',
  relationTo: 'users',
  required: true,
  admin: { hidden: true, readOnly: true },
}

const setCreatedBy: CollectionBeforeChangeHook = ({ operation, data, req }) => {
  const next = { ...data };

  if (operation === 'create') {
    next.createdBy = req.user?.id;
    return next;
  }

  delete next.createdBy;
  return next;
};

export const addCreatedBy = (config: Config): Config => ({
  ...config,
  collections: (config.collections ?? []).map((collection: CollectionConfig) => {
    if (collection.slug === 'users') return collection

    const fields = collection.fields ?? []
    const hasCreatedBy = fields.some(
      (f) => typeof f === 'object' && f !== null && 'name' in f && f.name === 'createdBy',
    );

    return {
      ...collection,
      fields: hasCreatedBy ? fields : [createdByField, ...fields],
      hooks: {
        ...collection.hooks,
        beforeChange: [setCreatedBy, ...(collection.hooks?.beforeChange ?? [])],
      },
    }
  }),
});
