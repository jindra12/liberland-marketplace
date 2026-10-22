import type { CollectionConfig } from 'payload'

// Only the chain-verifying endpoint writes this cache; clients cannot invent pool/proposal records.
export const VentureChainIndexes: CollectionConfig = {
  slug: 'venture-chain-indexes',
  admin: { hidden: true },
  access: { create: () => false, read: () => false, update: () => false, delete: () => false },
  fields: [
    { name: 'key', type: 'text', required: true, unique: true, index: true },
    { name: 'lastBlock', type: 'number', required: true },
    { name: 'blockHash', type: 'text', required: true },
    { name: 'pools', type: 'json', required: true },
    { name: 'proposals', type: 'json', required: true },
  ],
}
