import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import type { FieldHook } from 'payload'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { load } from 'cheerio'
import { markdownField } from '@/fields/markdownField'
import PostMarkdownContent from '@/components/PostMarkdown/PostMarkdownContent'

describe('Markdown persistence and safe rendering', () => {
  it.each([
    { name: 'ordinary Markdown', suffix: '' },
    { name: 'hostile embedded HTML', suffix: '\n\n<img src="x" onerror="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">bad link</a>' },
  ])('preserves formatting and rejects executable markup with $name', async (fixture) => {
    const field = markdownField({ name: 'description' })
    if (field.type !== 'textarea') {
      throw new Error('The actual Markdown field must be a textarea.')
    }
    const source = '> A normal blockquote\n\n`Array<string>`\n\nFish & chips' + fixture.suffix
    const stored = await (field.hooks?.beforeValidate || []).reduce(async (previous, hook) =>
      hook(mock<Parameters<FieldHook>[0]>({ value: await previous })), Promise.resolve(source))
    const html = renderToStaticMarkup(React.createElement(PostMarkdownContent, { source: stored }))
    const document = load(html)
    expect(document('blockquote').text()).toContain('A normal blockquote')
    expect(document('code').text()).toBe('Array<string>')
    expect(document('p').text()).toContain('Fish & chips')
    expect(document('script, [onerror], [onload], a[href^="javascript:"]')).toHaveLength(0)
  })
})
