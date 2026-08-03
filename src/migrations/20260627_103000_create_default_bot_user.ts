import {
  getDefaultBotUserCredentials,
  getDefaultBotUserData,
} from '@/utilities/defaultBotUser'

type DefaultBotUserMigrationPayload = {
  db: {
    create: (args: {
      collection: 'users'
      data: ReturnType<typeof getDefaultBotUserData>
      req?: unknown
    }) => Promise<unknown>
    delete: (args: {
      collection: 'users'
      id: string
      req?: unknown
    }) => Promise<unknown>
  }
  find: (args: {
    collection: 'users'
    depth: 0
    limit: 1
    overrideAccess: true
    where: {
      OR: Array<
        | {
            bot: {
              equals: true
            }
          }
        | {
            email: {
              equals: string
            }
          }
      >
    }
  }) => Promise<{
    docs: Array<{
      id: string | number
    }>
    totalDocs: number
  }>
  logger: {
    info: (message: string) => void
    warn: (message: string) => void
  }
}

type DefaultBotUserMigrationUpArgs = {
  payload: DefaultBotUserMigrationPayload
  req?: unknown
  session?: unknown
}

type DefaultBotUserMigrationDownArgs = DefaultBotUserMigrationUpArgs

export const up = async ({ payload }: DefaultBotUserMigrationUpArgs) => {
  const credentials = getDefaultBotUserCredentials()

  if (!credentials) {
    throw new Error(
      'CHATGPT_KEY must be set before running the bot user migration.',
    )
  }

  const existingBots = await payload.find({
    collection: 'users',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      OR: [
        {
          bot: {
            equals: true,
          },
        },
        {
          email: {
            equals: credentials.email,
          },
        },
      ],
    },
  })

  if (existingBots.totalDocs > 0) {
    payload.logger.info('[migration:create_default_bot_user] Bot user already exists, skipping.')
    return
  }

  await payload.db.create({
    collection: 'users',
    data: getDefaultBotUserData(credentials),
  })

  payload.logger.info('[migration:create_default_bot_user] Created the default bot user.')
}

export const down = async ({ payload }: DefaultBotUserMigrationDownArgs) => {
  const existingBots = await payload.find({
    collection: 'users',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      OR: [
        {
          bot: {
            equals: true,
          },
        },
      ],
    },
  })

  if (existingBots.totalDocs === 0) {
    payload.logger.info('[migration:create_default_bot_user] No bot user exists, nothing to remove.')
    return
  }

  const botUser = existingBots.docs[0]

  if (!botUser) {
    return
  }

  await payload.db.delete({
    collection: 'users',
    id: String(botUser.id),
  })

  payload.logger.info('[migration:create_default_bot_user] Removed the default bot user.')
}
