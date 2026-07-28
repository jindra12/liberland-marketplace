import type { Header as HeaderType } from '@/payload-types'
import { HeaderClient } from './Component.client'
import { getCachedGlobal } from '@/utilities/getGlobals'
import React from 'react'

export const Header = async () => {
  const headerData = await getCachedGlobal('header', 1)() as HeaderType;

  return <HeaderClient data={headerData} />
}
