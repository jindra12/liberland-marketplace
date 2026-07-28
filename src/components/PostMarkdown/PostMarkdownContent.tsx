'use client'

import MDEditor from '@uiw/react-md-editor/nohighlight'

type Props = {
  className?: string
  source: string
}

const PostMarkdownContent = (props: Props) => {
  return <MDEditor.Markdown className={props.className} source={props.source} />
}

export default PostMarkdownContent
