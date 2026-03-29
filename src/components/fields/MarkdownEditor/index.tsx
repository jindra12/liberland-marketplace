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
import { useLazyLoad } from '@/components/hooks'

import './index.scss'

type MarkdownEditorModule = typeof import('@uiw/react-md-editor/nohighlight')

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
  const markdownEditorModule = useLazyLoad(
    () => import('@uiw/react-md-editor/nohighlight'),
    'Failed to load markdown editor module.',
  )
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

  const MDEditor = markdownEditorModule?.default

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
          {markdownEditorModule && MDEditor ? (
            <MDEditor
              commands={[
                markdownEditorModule.commands.title,
                markdownEditorModule.commands.bold,
                markdownEditorModule.commands.italic,
                markdownEditorModule.commands.strikethrough,
                markdownEditorModule.commands.divider,
                markdownEditorModule.commands.link,
                markdownEditorModule.commands.quote,
                markdownEditorModule.commands.code,
                markdownEditorModule.commands.codeBlock,
                markdownEditorModule.commands.divider,
                markdownEditorModule.commands.unorderedListCommand,
                markdownEditorModule.commands.orderedListCommand,
                markdownEditorModule.commands.checkedListCommand,
              ]}
              data-color-mode={theme}
              extraCommands={[
                markdownEditorModule.commands.codeEdit,
                markdownEditorModule.commands.codeLive,
                markdownEditorModule.commands.codePreview,
                markdownEditorModule.commands.fullscreen,
              ]}
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
          ) : (
            <textarea
              className="markdown-editor-field__fallback"
              disabled={isReadOnly}
              id={inputId}
              name={path}
              onChange={(event) => setValue(event.target.value)}
              placeholder={
                typeof translatedPlaceholder === 'string' ? translatedPlaceholder : undefined
              }
              value={markdownValue}
            />
          )}
        </div>

        {AfterInput}
        <RenderCustomComponent CustomComponent={Description} Fallback={<FieldDescription description={description} path={path} />} />
      </div>
    </div>
  )
}

export default withCondition(MarkdownEditorFieldComponent)
