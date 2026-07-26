import { sanitizeMarkdownFieldValue } from '@/hooks/sanitizeMarkdownFieldValue'
import type { Field } from 'payload'
import { TEXTAREA_MAX_LENGTH } from './constants'

type MarkdownFieldOptions = {
  name: string
  label?: string
  required?: boolean
}

export const markdownField = ({ name, label, required }: MarkdownFieldOptions): Field => ({
  name,
  label,
  type: 'textarea',
  maxLength: TEXTAREA_MAX_LENGTH,
  required,
  admin: {
    description: 'Supports Markdown with toolbar + preview. Raw HTML is sanitized on save and read.',
    components: {
      Field: '@/components/fields/MarkdownEditor',
    },
  },
  hooks: {
    beforeValidate: [sanitizeMarkdownFieldValue],
    beforeChange: [sanitizeMarkdownFieldValue],
    afterRead: [sanitizeMarkdownFieldValue],
  },
})
