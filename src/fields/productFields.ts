import { markdownField } from "@/fields/markdownField";
import { getCurrencies } from "@/utilities/getCurrencies";
import { Field } from "payload";

export const productFields: Field[] = [
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
        options: getCurrencies(),
      },
    ],
  },
  {
    name: "image",
    type: "upload",
    relationTo: "media",
  },
  markdownField({
    name: 'description',
    label: 'Description',
  }),
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
];
