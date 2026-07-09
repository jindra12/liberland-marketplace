import type { CollectionAfterChangeHook } from 'payload'

import {
  getDefaultBotUserCredentials,
  getDefaultBotUserData,
} from '@/utilities/defaultBotUser'

type CreateDefaultBotUserIfMissingArgs = {
  botUserExists: boolean
  createBotUser: () => Promise<void>
  isBotUser: boolean
}

export const createDefaultBotUserIfMissing = async ({
  botUserExists,
  createBotUser,
  isBotUser,
}: CreateDefaultBotUserIfMissingArgs): Promise<boolean> => {
  if (isBotUser || botUserExists) {
    return false
  }

  await createBotUser()

  return true
}

export const createDefaultBotUser: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== 'create') return doc

  const isBotUser =
    typeof doc === 'object' &&
    doc !== null &&
    !Array.isArray(doc) &&
    'bot' in doc &&
    doc.bot === true

  if (isBotUser) {
    return doc
  }

  const existingBots = await req.payload.find({
    collection: 'users',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
    where: {
      bot: {
        equals: true,
      },
    },
  })

  const credentials = getDefaultBotUserCredentials()

  await createDefaultBotUserIfMissing({
    botUserExists: existingBots.totalDocs > 0,
    createBotUser: async () => {
      if (!credentials) {
        return
      }

      await req.payload.db.create({
        collection: 'users',
        data: getDefaultBotUserData(credentials),
        req,
      })
    },
    isBotUser,
  })

  return doc
}
