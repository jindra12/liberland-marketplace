import sanitizeHtml from 'sanitize-html'
import type { FieldHook } from 'payload'

const sanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
}

// Remove raw HTML from markdown text before persistence to prevent HTML-based XSS payloads.
export const sanitizeMarkdownFieldValue: FieldHook = ({ value }) => {
  if (typeof value !== 'string') {
    return value
  }

  return sanitizeHtml(value, sanitizeOptions)
}

