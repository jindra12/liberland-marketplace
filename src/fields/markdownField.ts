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
    description: 'Supports Markdown with toolbar + preview. HTML is sanitized when rendered.',
    components: {
      Field: '@/components/fields/MarkdownEditor',
    },
  },
})
