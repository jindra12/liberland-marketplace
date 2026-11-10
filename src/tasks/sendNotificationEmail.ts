import type { TaskConfig } from 'payload'

export const sendNotificationEmailTask: TaskConfig<'sendNotificationEmail'> = {
  slug: 'sendNotificationEmail',
  inputSchema: [
    { name: 'to', type: 'email', required: true },
    { name: 'subject', type: 'text', required: true },
    { name: 'html', type: 'textarea', required: true },
    { name: 'text', type: 'textarea', required: true },
  ],
  retries: { attempts: 5, backoff: { type: 'exponential', delay: 60_000 } },
  handler: async ({ input, req }) => {
    await req.payload.sendEmail(input)
    return { output: {} }
  },
}
