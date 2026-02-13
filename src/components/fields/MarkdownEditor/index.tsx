'use client'

import { getTranslation } from '@payloadcms/translations'
import MDEditor, { commands } from '@uiw/react-md-editor/nohighlight'
import {
  FieldDescription,
  FieldError,
  FieldLabel,
  RenderCustomComponent,
  fieldBaseClass,
  useField,
  useTheme,
  useTranslation,
  withCondition,
} from '@payloadcms/ui'
import type { TextareaFieldClientComponent } from 'payload'
import React from 'react'

import './index.scss'

const editorCommands = [
  commands.title,
  commands.bold,
  commands.italic,
  commands.strikethrough,
  commands.divider,
  commands.link,
  commands.quote,
  commands.code,
  commands.codeBlock,
  commands.divider,
  commands.unorderedListCommand,
  commands.orderedListCommand,
  commands.checkedListCommand,
]

const extraEditorCommands = [commands.codeEdit, commands.codeLive, commands.codePreview, commands.fullscreen]

const MarkdownEditorFieldComponent: TextareaFieldClientComponent = ({
  field: {
    admin: { className, description, placeholder } = {},
    label,
    localized,
    required,
  },
  path: pathFromProps,
  readOnly,
}) => {
  const {
    customComponents: { AfterInput, BeforeInput, Description, Error, Label } = {},
    disabled,
    path,
    setValue,
    showError,
    value,
  } = useField<string>({
    potentiallyStalePath: pathFromProps,
  })
  const { i18n } = useTranslation()
  const { theme } = useTheme()

  const inputId = `field-${path.replace(/\./g, '__')}`
  const isReadOnly = Boolean(readOnly || disabled)
  const markdownValue = typeof value === 'string' ? value : ''
  const translatedPlaceholder = placeholder ? getTranslation(placeholder, i18n) : undefined
  const classes = [fieldBaseClass, 'markdown-editor-field', className, showError && 'error', isReadOnly && 'read-only']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      <RenderCustomComponent
        CustomComponent={Label}
        Fallback={<FieldLabel htmlFor={inputId} label={label} localized={localized} path={path} required={required} />}
      />

      <div className={`${fieldBaseClass}__wrap`}>
        <RenderCustomComponent CustomComponent={Error} Fallback={<FieldError path={path} showError={showError} />} />
        {BeforeInput}

        <div className="markdown-editor-field__editor">
          <MDEditor
            commands={editorCommands}
            data-color-mode={theme}
            extraCommands={extraEditorCommands}
            height={360}
            hideToolbar={isReadOnly}
            onChange={(nextValue) => setValue(nextValue ?? '')}
            preview="live"
            previewOptions={{ skipHtml: true }}
            textareaProps={{
              disabled: isReadOnly,
              id: inputId,
              name: path,
              placeholder: typeof translatedPlaceholder === 'string' ? translatedPlaceholder : undefined,
            }}
            value={markdownValue}
            visibleDragbar={!isReadOnly}
          />
        </div>

        {AfterInput}
        <RenderCustomComponent CustomComponent={Description} Fallback={<FieldDescription description={description} path={path} />} />
      </div>
    </div>
  )
}

export default withCondition(MarkdownEditorFieldComponent)
