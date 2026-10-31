import { getPayload, type Payload } from 'payload'
import config from '@payload-config'
import { openPoppyStore } from '../store/utils'

export const findPoppyAccount = async (payload: Payload, accountId: string) => {
  const user = await payload.findByID({
    collection: 'users',
    id: accountId,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })
  return user && !user.banned ? user : null
}

export const revokePoppyAccountGrants = async (accountId: string) => {
  const store = await openPoppyStore(await getPayload({ config }))
  await store.put('account_security', accountId, {
    signedOutBefore: new Date().toISOString(),
  })
}
