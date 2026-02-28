import type { Field } from 'payload'

const fallbackServerURL = 'http://localhost:3001'

const getServerURL = (): string => process.env.NEXT_PUBLIC_SERVER_URL?.trim() || fallbackServerURL

export const serverURLField = (): Field => ({
  name: 'serverURL',
  label: 'Server URL',
  type: 'text',
  virtual: true,
  admin: {
    readOnly: true,
    description: 'Read from NEXT_PUBLIC_SERVER_URL (fallback: http://localhost:3001).',
  },
  hooks: {
    afterRead: [() => getServerURL()],
  },
})

