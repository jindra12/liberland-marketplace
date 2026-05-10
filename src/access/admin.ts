import type { Access, FieldAccess } from 'payload'

import type { AccessUser } from './types'

export const isAdminUser = (user: AccessUser): boolean => user?.role?.includes('admin') || false

export const adminOnly: Access = ({ req: { user } }) => isAdminUser(user)

export const adminOnlyFieldAccess: FieldAccess = ({ req }) => isAdminUser(req.user)
