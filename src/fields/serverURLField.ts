import type { Field } from 'payload'
import { TEXT_INPUT_MAX_LENGTH } from './constants'

const fallbackServerURL = 'http://localhost:3001'

const getServerURL = (): string => process.env.NEXT_PUBLIC_SERVER_URL?.trim() || fallbackServerURL

export const serverURLField = (): Field => ({
  name: 'serverURL',
  label: 'Server URL',
  type: 'text',
  maxLength: TEXT_INPUT_MAX_LENGTH,
  virtual: true,
  admin: {
    hidden: true,
    readOnly: true,
    description: 'Read from NEXT_PUBLIC_SERVER_URL (fallback: http://localhost:3001).',
  },
  hooks: {
    afterRead: [() => getServerURL()],
  },
})
