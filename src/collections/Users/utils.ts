type UserCreateData = {
  bot?: boolean
  emailVerified?: boolean
  role?: string[]
}

export const sanitizeUserCreateData = ({
  data,
  existingUserCount,
  isAdmin,
  verifiedByAuthService = false,
}: {
  data?: UserCreateData | null
  existingUserCount: number
  isAdmin: boolean
  verifiedByAuthService?: boolean
}): UserCreateData | undefined => {
  if (!data) {
    return undefined
  }

  if (existingUserCount === 0) {
    return {
      ...data,
      bot: false,
      emailVerified: verifiedByAuthService ? data.emailVerified : false,
      role: ['admin'],
    }
  }

  if (isAdmin) {
    return data
  }

  return {
    ...data,
    bot: false,
    emailVerified: verifiedByAuthService ? data.emailVerified : false,
    role: ['user'],
  }
}
