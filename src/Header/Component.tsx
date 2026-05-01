import type { Header as HeaderType } from '@/payload-types'
import { HeaderClient } from './Component.client'
import { getCachedGlobal } from '@/utilities/getGlobals'
import React from 'react'

export const Header = async () => {
  const headerData: HeaderType = await getCachedGlobal('header', 1)()

  return <HeaderClient data={headerData} />
}
