import type { PayloadRequest } from 'payload'

type AdminNotificationUser = {
  email?: string | null
  role?: string[] | null
}

const isAdminUser = (user: AdminNotificationUser | null | undefined): boolean =>
  user?.role?.includes('admin') || false

export const getAdminNotificationEmails = async ({
  req,
}: {
  req: PayloadRequest
}): Promise<string[]> => {
  const result = await req.payload.find({
    collection: 'users',
    depth: 0,
    limit: 1000,
    overrideAccess: true,
    pagination: false,
    req,
    select: {
      email: true,
      role: true,
    },
  })

  const users = result.docs as AdminNotificationUser[]

  return users
    .filter((user) => isAdminUser(user))
    .map((user) => (typeof user.email === 'string' ? user.email : null))
    .filter((email): email is string => Boolean(email))
}
