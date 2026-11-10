'use client'

import MDEditor from '@uiw/react-md-editor/nohighlight'
import rehypeSanitize from 'rehype-sanitize'

type Props = {
  className?: string
  source: string
}

const PostMarkdownContent = (props: Props) => {
  return <MDEditor.Markdown className={props.className} source={props.source} rehypePlugins={[rehypeSanitize]} />
}

export default PostMarkdownContent
