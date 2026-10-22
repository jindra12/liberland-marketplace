import type { CollectionConfig } from 'payload'

// Private deployment journals are accessible only through the owner-checked Venture endpoint.
export const VentureDeploymentRecoveries: CollectionConfig = {
  slug: 'venture-deployment-recoveries',
  admin: { hidden: true },
  access: { create: () => false, read: () => false, update: () => false, delete: () => false },
  fields: [
    { name: 'key', type: 'text', required: true, unique: true, index: true },
    { name: 'record', type: 'json', required: true },
  ],
}
