import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionAfterReadHook,
  CollectionBeforeChangeHook,
} from 'payload'

import type { NotificationTargetCollection } from '@/newsletter/constants'

import type {
  ChildNotificationDoc,
  RelatedItemNotificationConfig,
} from './sendRelatedItemPublishedNotifications'
import type { IdentityResolver } from './updateIdentityItemCount'

export const lazySendItemUpdateNotifications = (
  targetCollection: NotificationTargetCollection,
): CollectionAfterChangeHook => {
  return async (args) => {
    const { sendItemUpdateNotifications } = await import('./sendItemUpdateNotifications')
    return sendItemUpdateNotifications(targetCollection)(args)
  }
}

export const lazySendRelatedItemPublishedNotifications = <TDoc extends ChildNotificationDoc>(
  config: RelatedItemNotificationConfig<TDoc>,
): CollectionAfterChangeHook<TDoc> => {
  return async (args) => {
    const { sendRelatedItemPublishedNotifications } = await import(
      './sendRelatedItemPublishedNotifications'
    )
    return sendRelatedItemPublishedNotifications(config)(args)
  }
}

export const lazyUpdateIdentityItemCountAfterChange = (
  field: IdentityResolver,
): CollectionAfterChangeHook => {
  return async (args) => {
    const { updateIdentityItemCountAfterChange } = await import('./updateIdentityItemCount')
    return updateIdentityItemCountAfterChange(field)(args)
  }
}

export const lazyUpdateIdentityItemCountAfterDelete = (
  field: IdentityResolver,
): CollectionAfterDeleteHook => {
  return async (args) => {
    const { updateIdentityItemCountAfterDelete } = await import('./updateIdentityItemCount')
    return updateIdentityItemCountAfterDelete(field)(args)
  }
}

export const lazyPopulateProductCryptoPrices: CollectionAfterReadHook = async (args) => {
  const { populateProductCryptoPrices } = await import('./populateProductCryptoPrices')
  return populateProductCryptoPrices(args)
}

export const lazyComputeOrderAmountOnCreate: CollectionBeforeChangeHook = async (args) => {
  const { computeOrderAmountOnCreate } = await import('./computeOrderAmountOnCreate')
  return computeOrderAmountOnCreate(args)
}

export const lazyLockOrderCryptoPricesOnCreate: CollectionBeforeChangeHook = async (args) => {
  const { lockOrderCryptoPricesOnCreate } = await import('./lockOrderCryptoPricesOnCreate')
  return lockOrderCryptoPricesOnCreate(args)
}

export const lazyAutoConfirmOrderOnTransactionHashAdd: CollectionAfterChangeHook = async (args) => {
  const { autoConfirmOrderOnTransactionHashAdd } = await import('./autoConfirmOrderOnTransactionHashAdd')
  return autoConfirmOrderOnTransactionHashAdd(args)
}
