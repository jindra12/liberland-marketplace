'use client'

import MDEditor, { commands } from '@uiw/react-md-editor/nohighlight'

type Props = {
  inputId: string
  isReadOnly: boolean
  markdownValue: string
  placeholder?: string
  setValue: (nextValue: string) => void
  path: string
  theme: string
}

const MarkdownEditorContent = (props: Props) => {
  const colorMode = props.theme === 'dark' ? 'dark' : 'light'

  return (
    <MDEditor
      commands={[
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
      ]}
      data-color-mode={colorMode}
      extraCommands={[
        commands.codeEdit,
        commands.codeLive,
        commands.codePreview,
        commands.fullscreen,
      ]}
      height={360}
      hideToolbar={props.isReadOnly}
      onChange={(nextValue) => props.setValue(nextValue ?? '')}
      preview="live"
      previewOptions={{ skipHtml: true }}
      textareaProps={{
        disabled: props.isReadOnly,
        id: props.inputId,
        name: props.path,
        placeholder: props.placeholder,
      }}
      value={props.markdownValue}
      visibleDragbar={!props.isReadOnly}
    />
  )
}

export default MarkdownEditorContent
