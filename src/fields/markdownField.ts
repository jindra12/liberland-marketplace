import { sanitizeMarkdownFieldValue } from '@/hooks/sanitizeMarkdownFieldValue'
import type { Field } from 'payload'

type MarkdownFieldOptions = {
  name: string
  label?: string
}

export const markdownField = ({ name, label }: MarkdownFieldOptions): Field => ({
  name,
  label,
  type: 'textarea',
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
