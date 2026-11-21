import type { CollectionBeforeOperationHook } from 'payload'
import { CART_SECRET_HEADER } from '@/security/constants'

/** Forward the cart capability to the ecommerce plugin's existing access checks. */
export const authorizeCartRequest: CollectionBeforeOperationHook<'carts'> = ({ args, req }) => {
  const secret = req.headers.get(CART_SECRET_HEADER)
  if (secret) {
    req.context = { ...req.context, cartSecret: secret }
  }
  return args
}
