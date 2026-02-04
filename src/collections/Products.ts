import type { CollectionConfig } from 'payload'
import { Currencies, isoCodes, type IsoCode } from '@sctg/currencies'
import { authenticated } from '@/access/authenticated';
import { onlyOwnDocsOrAdmin } from '@/access/onlyOwnDocsOrAdmin';
import { anyone } from '@/access/anyone';

const currencyOptions = (Object.keys(isoCodes) as IsoCode[])
  .sort()
  .map((code) => ({
    label: `${code} — ${Currencies.getCurrencyName(code)}`,
    value: code,
  }))

export const Products: CollectionConfig = {
  slug: 'products',
  access: {
    create: authenticated,
    delete: onlyOwnDocsOrAdmin,
    read: anyone,
    update: onlyOwnDocsOrAdmin,
  },
  labels: {
    singular: 'Product / Service',
    plural: 'Products & Services',
  }, // `labels` controls the Admin-visible name. :contentReference[oaicite:1]{index=1}

  admin: {
    useAsTitle: 'name',
    group: 'Marketplace',
    defaultColumns: ['name', 'company', 'price', 'url'],
  },

  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },

    {
      name: 'company',
      type: 'relationship',
      relationTo: 'companies',
      required: true,
    },

    {
      name: 'url',
      type: 'text',
      required: false,
      validate: (val?: string | null) => {
        if (!val) {
          return true
        }
        try {
          new URL(val);
          return true;
        } catch {
          return 'Please enter a valid URL.'
        }
      },
    },

    {
      name: 'price',
      type: 'group',
      fields: [
        {
          name: 'amount',
          type: 'number',
          required: true,
          min: 0,
        },
        {
          name: 'currency',
          type: 'select',
          required: true,
          defaultValue: 'USD',
          options: currencyOptions,
        },
      ],
    },

    // Key/value record admin can add/remove
    // (Payload's Array field is perfect for "dynamic rows") :contentReference[oaicite:2]{index=2}
    {
      name: 'properties',
      type: 'array',
      fields: [
        {
          name: 'key',
          type: 'text',
          required: true,
        },
        {
          name: 'value',
          type: 'text',
        },
      ],
    },
  ],
};
