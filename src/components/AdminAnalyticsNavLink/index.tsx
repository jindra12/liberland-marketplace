import { NavHamburger, NavWrapper } from '@payloadcms/next/client'
import { Logout } from '@payloadcms/ui'
import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent'
import { EntityType, groupNavItems } from '@payloadcms/ui/shared'
import type { EntityToGroup } from '@payloadcms/ui/shared'
import { baseClass } from './constants'
import AdminAnalyticsNavClient from './index.client'
import type { AdminNavProps } from './types'
import { getNavPrefs } from './utils'

const AdminAnalyticsNavLink = async (props: AdminNavProps) => {
  const {
    documentSubViewType,
    i18n,
    locale,
    params,
    payload,
    permissions,
    req,
    searchParams,
    user,
    viewType,
    visibleEntities,
  } = props

  if (!payload?.config) {
    return null
  }

  if (!permissions) {
    return null
  }

  const {
    admin: {
      components: { afterNavLinks, logout },
    },
    collections,
    globals,
  } = payload.config

  const availableEntities = visibleEntities ?? { collections: [], globals: [] }
  const entitiesToGroup: EntityToGroup[] = [
    ...collections
      .filter(({ slug }) => availableEntities.collections.includes(slug))
      .map(
        (collection): EntityToGroup => ({
          entity: collection,
          type: EntityType.collection,
        }),
      ),
    ...globals
      .filter(({ slug }) => availableEntities.globals.includes(slug))
      .map(
        (global): EntityToGroup => ({
          entity: global,
          type: EntityType.global,
        }),
      ),
  ]

  const groups = groupNavItems(entitiesToGroup, permissions, i18n)

  const navPreferences = await getNavPrefs(req)

  const logoutComponent = RenderServerComponent({
    clientProps: {
      documentSubViewType,
      viewType,
    },
    Component: logout?.Button,
    Fallback: Logout,
    importMap: payload.importMap,
    serverProps: {
      i18n,
      locale,
      params,
      payload,
      permissions,
      searchParams,
      user,
    },
  })

  return (
    <NavWrapper baseClass={baseClass}>
      <nav className={`${baseClass}__wrap`}>
        <AdminAnalyticsNavClient groups={groups} navPreferences={navPreferences} />
        {RenderServerComponent({
          clientProps: {
            documentSubViewType,
            viewType,
          },
          Component: afterNavLinks,
          importMap: payload.importMap,
          serverProps: {
            i18n,
            locale,
            params,
            payload,
            permissions,
            searchParams,
            user,
          },
        })}
        <div className={`${baseClass}__controls`}>
          {logoutComponent}
        </div>
      </nav>
      <div className={`${baseClass}__header`}>
        <div className={`${baseClass}__header-content`}>
          <NavHamburger baseClass={baseClass} />
        </div>
      </div>
    </NavWrapper>
  )
}

export default AdminAnalyticsNavLink
