type UserCreateData = {
  bot?: boolean
  role?: string[]
}

export const sanitizeUserCreateData = ({
  data,
  existingUserCount,
  isAdmin,
}: {
  data?: UserCreateData | null
  existingUserCount: number
  isAdmin: boolean
}): UserCreateData | undefined => {
  if (!data) {
    return undefined
  }

  if (existingUserCount === 0) {
    return {
      ...data,
      bot: false,
      role: ['admin'],
    }
  }

  if (isAdmin) {
    return data
  }

  return {
    ...data,
    bot: false,
    role: ['user'],
  }
}
