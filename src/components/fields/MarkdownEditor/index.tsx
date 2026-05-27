'use client'

import { getTranslation } from '@payloadcms/translations'
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

const MarkdownEditor = React.lazy(async () => await import('./MarkdownEditorContent'))

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
  const fallback = (
    <textarea
      className="markdown-editor-field__fallback"
      disabled={isReadOnly}
      id={inputId}
      name={path}
      onChange={(event) => setValue(event.target.value)}
      placeholder={typeof translatedPlaceholder === 'string' ? translatedPlaceholder : undefined}
      value={markdownValue}
    />
  )

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
          <React.Suspense fallback={fallback}>
            <MarkdownEditor
              inputId={inputId}
              isReadOnly={isReadOnly}
              markdownValue={markdownValue}
              placeholder={
                typeof translatedPlaceholder === 'string' ? translatedPlaceholder : undefined
              }
              setValue={setValue}
              path={path}
              theme={theme}
            />
          </React.Suspense>
        </div>

        {AfterInput}
        <RenderCustomComponent
          CustomComponent={Description}
          Fallback={<FieldDescription description={description} path={path} />}
        />
      </div>
    </div>
  )
}

export default withCondition(MarkdownEditorFieldComponent)
