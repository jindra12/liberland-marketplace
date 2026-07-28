'use client'

import { Link } from '@payloadcms/ui'

const baseClass = 'nav'

type Props = {
  href: string
  id: string
  isActive: boolean
  label: string
  pathname: string
}

const renderLabel = (label: string, isActive: boolean) => (
  <>
    {isActive ? <div className={`${baseClass}__link-indicator`} /> : null}
    <span className={`${baseClass}__link-label`}>{label}</span>
  </>
)

const AdminAnalyticsNavItemLink = ({ href, id, isActive, label, pathname }: Props) => {
  const content = renderLabel(label, isActive)

  if (pathname === href) {
    return <div className={`${baseClass}__link`} id={id}>{content}</div>
  }

  return (
    <Link className={`${baseClass}__link`} href={href} id={id} prefetch={false}>
      {content}
    </Link>
  )
}

export default AdminAnalyticsNavItemLink
