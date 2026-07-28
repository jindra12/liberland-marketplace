'use client'

import { getTranslation } from '@payloadcms/translations'
import { BrowseByFolderButton, NavGroup, useConfig, useTranslation } from '@payloadcms/ui'
import type { NavGroupType } from '@payloadcms/ui/shared'
import { EntityType } from '@payloadcms/ui/shared'
import type { NavPreferences } from 'payload'
import { formatAdminURL } from 'payload/shared'
import { usePathname } from 'next/navigation'
import AdminAnalyticsNavItemLink from './AdminAnalyticsNavItemLink.client'

type Props = {
  groups: NavGroupType[]
  navPreferences: NavPreferences | null
}

const analyticsGroupLabel = 'Analytics'
const analyticsItemLabel = 'Analytics'

const isActivePath = (pathname: string, href: string) =>
  pathname.startsWith(href) && ['/', undefined].includes(pathname[href.length])

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
        <AdminAnalyticsNavItemLink
          href={analyticsHref}
          id="nav-analytics"
          isActive={isAnalyticsActive}
          label={analyticsItemLabel}
          pathname={pathname}
        />
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

            return (
              <AdminAnalyticsNavItemLink
                href={href}
                id={id}
                isActive={isActive}
                key={slug}
                label={getTranslation(entityLabel, i18n)}
                pathname={pathname}
              />
            )
          })}
        </NavGroup>
      ))}
    </>
  )
}

export default AdminAnalyticsNavClient
