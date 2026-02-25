import { markdownField } from "@/fields/markdownField";
import { getCurrencies } from "@/utilities/getCurrencies";
import { Field } from "payload";

const allowedProtocols = new Set(['http:', 'https:'])
const plainEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const plainPhoneRegex = /^\+?[0-9().\-\s]{7,25}$/

const isDomainLikeHostname = (hostname: string): boolean => {
  if (!hostname) {
    return false
  }

  if (hostname === 'localhost') {
    return true
  }

  // Do not allow IP-based hosts (IPv4 / IPv6) for product links.
  if (hostname.includes(':') || hostname.startsWith('[') || hostname.endsWith(']')) {
    return false
  }

  const parts = hostname.split('.')
  if (parts.length < 2) {
    return false
  }

  // Require at least one letter to avoid numeric-only hosts like 127.0.0.1.
  if (!/[a-z]/i.test(hostname)) {
    return false
  }

  return parts.every((part) => /^[a-z0-9-]+$/i.test(part) && !part.startsWith('-') && !part.endsWith('-'))
}

const isLinkWithoutProtocol = (value: string): boolean => {
  if (value.includes('://') || value.startsWith('//') || value.includes('@') || /\s/.test(value)) {
    return false
  }

  try {
    const parsed = new URL(`https://${value}`)
    return isDomainLikeHostname(parsed.hostname)
  } catch {
    return false
  }
}

const hasValidPhoneDigits = (value: string): boolean => {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15
}

const isPlainPhoneNumber = (value: string): boolean => {
  if (!plainPhoneRegex.test(value)) {
    return false
  }

  return hasValidPhoneDigits(value)
}

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
    name: 'companyIdentityId',
    type: 'text',
    index: true,
    admin: {
      hidden: true,
      readOnly: true,
    },
  },

  {
    name: 'url',
    type: 'text',
    required: false,
    validate: (val?: string | null) => {
      if (!val?.trim()) {
        return true
      }

      const value = val.trim()

      // Allow plain emails
      if (plainEmailRegex.test(value)) {
        return true
      }

      // Allow plain phone numbers
      if (isPlainPhoneNumber(value)) {
        return true
      }

      // Allow domain links without protocol, e.g. google.com, www.google.com/path
      if (isLinkWithoutProtocol(value)) {
        return true
      }

      try {
        const parsed = new URL(value)
        const protocol = parsed.protocol.toLowerCase()

        if (!allowedProtocols.has(protocol)) {
          return `Links must use one of: http:, https:`
        }

        if (!isDomainLikeHostname(parsed.hostname)) {
          return 'Please enter a valid domain URL.'
        }

        return true;
      } catch {
        return 'Please enter a valid URL, domain, email, or phone number.'
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
