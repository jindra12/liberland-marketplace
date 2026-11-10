import type { Field } from 'payload'

/** A private CAS token that ordinary content edits cannot reset or submit. */
export const operationalUpdatedAtField = (): Field => ({
  name: 'operationalUpdatedAt',
  type: 'date',
  hidden: true,
  access: { create: () => false, update: () => false, read: () => false },
})
