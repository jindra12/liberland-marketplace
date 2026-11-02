import type { CollectionConfig } from 'payload'
import { POPPY_COLLECTION } from '@/poppy/constants'

export const PoppyProtocolState: CollectionConfig = {
  slug: POPPY_COLLECTION,
  dbName: 'poppy_protocol_state',
  admin: { hidden: true },
  access: { create: () => false, read: () => false, update: () => false, delete: () => false },
  endpoints: false,
  graphQL: false,
  lockDocuments: false,
  timestamps: false,
  indexes: [{ fields: ['tenant', 'kind'] }],
  fields: [
    { name: 'id', type: 'text', required: true },
    { name: 'tenant', type: 'text', required: true },
    { name: 'kind', type: 'text', required: true },
    { name: 'version', type: 'text', required: true },
    { name: 'value', type: 'textarea', required: true },
    { name: 'expiresAt', type: 'date' },
  ],
}
