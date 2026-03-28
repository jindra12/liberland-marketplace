'use client'

import { getTranslation } from '@payloadcms/translations'
import { BrowseByFolderButton, Link, NavGroup, useConfig, useTranslation } from '@payloadcms/ui'
import type { NavGroupType } from '@payloadcms/ui/shared'
import { EntityType } from '@payloadcms/ui/shared'
import type { NavPreferences } from 'payload'
import { formatAdminURL } from 'payload/shared'
import { usePathname } from 'next/navigation'

const baseClass = 'nav'

type Props = {
  groups: NavGroupType[]
  navPreferences: NavPreferences | null
}

const analyticsGroupLabel = 'Analytics'
const analyticsItemLabel = 'Analytics'

const isActivePath = (pathname: string, href: string) =>
  pathname.startsWith(href) && ['/', undefined].includes(pathname[href.length])

const renderLabel = (label: string, isActive: boolean) => (
  <>
    {isActive ? <div className={`${baseClass}__link-indicator`} /> : null}
    <span className={`${baseClass}__link-label`}>{label}</span>
  </>
)

const renderNavLink = ({
  href,
  id,
  isActive,
  itemKey,
  label,
  pathname,
}: {
  href: string
  id: string
  isActive: boolean
  itemKey?: string
  label: string
  pathname: string
}) => {
  const content = renderLabel(label, isActive)

  if (pathname === href) {
    return (
      <div className={`${baseClass}__link`} id={id} key={itemKey}>
        {content}
      </div>
    )
  }

  return (
    <Link className={`${baseClass}__link`} href={href} id={id} key={itemKey} prefetch={false}>
      {content}
    </Link>
  )
}

const AdminAnalyticsNavClient = ({ groups, navPreferences }: Props) => {
  const pathname = usePathname()
  const {
    config: {
      admin: { routes: adminRoutes },
      folders,
      routes,
    },
  } = useConfig()
  const { i18n } = useTranslation()

  const adminRoute = routes.admin
  const folderURL = formatAdminURL({
    adminRoute,
    path: adminRoutes.browseByFolder,
  })
  const analyticsHref = formatAdminURL({
    adminRoute,
    path: '/analytics',
  })
  const viewingRootFolderView = Boolean(folders && pathname.startsWith(folderURL))
  const isAnalyticsActive = isActivePath(pathname, analyticsHref)

  return (
    <>
      {folders && folders.browseByFolder ? <BrowseByFolderButton active={viewingRootFolderView} /> : null}
      <NavGroup
        isOpen={navPreferences?.groups?.[analyticsGroupLabel]?.open}
        label={analyticsGroupLabel}
      >
        {renderNavLink({
          href: analyticsHref,
          id: 'nav-analytics',
          isActive: isAnalyticsActive,
          itemKey: 'analytics',
          label: analyticsItemLabel,
          pathname,
        })}
      </NavGroup>
      {groups.map(({ entities, label }) => (
        <NavGroup isOpen={navPreferences?.groups?.[label]?.open} key={label} label={label}>
          {entities.map(({ label: entityLabel, slug, type }) => {
            const href =
              type === EntityType.collection
                ? formatAdminURL({
                    adminRoute,
                    path: `/collections/${slug}`,
                  })
                : formatAdminURL({
                    adminRoute,
                    path: `/globals/${slug}`,
                  })
            const id = type === EntityType.collection ? `nav-${slug}` : `nav-global-${slug}`
            const isActive = isActivePath(pathname, href)

            return renderNavLink({
              href,
              id,
              isActive,
              itemKey: slug,
              label: getTranslation(entityLabel, i18n),
              pathname,
            })
          })}
        </NavGroup>
      ))}
    </>
  )
}

export default AdminAnalyticsNavClient
