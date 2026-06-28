import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-mongodb'

import {
  getDefaultBotUserCredentials,
  getDefaultBotUserData,
} from '@/utilities/defaultBotUser'

export const up = async ({ payload }: MigrateUpArgs) => {
  const existingBots = await payload.find({
    collection: 'users',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      bot: {
        equals: true,
      },
    },
  })

  if (existingBots.totalDocs > 0) {
    payload.logger.info('[migration:create_default_bot_user] Bot user already exists, skipping.')
    return
  }

  const credentials = getDefaultBotUserCredentials()

  if (!credentials) {
    throw new Error(
      'CHATGPT_KEY must be set before running the bot user migration.',
    )
  }

  await payload.create({
    collection: 'users',
    data: getDefaultBotUserData(credentials),
    overrideAccess: true,
  })

  payload.logger.info('[migration:create_default_bot_user] Created the default bot user.')
}

export const down = async ({ payload }: MigrateDownArgs) => {
  const existingBots = await payload.find({
    collection: 'users',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      bot: {
        equals: true,
      },
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

  await payload.delete({
    collection: 'users',
    id: String(botUser.id),
    overrideAccess: true,
  })

  payload.logger.info('[migration:create_default_bot_user] Removed the default bot user.')
}
