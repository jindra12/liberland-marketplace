import type { PayloadRequest } from 'payload'
import type { Config } from '@/payload-types'

export const deliverNotificationEmail = async (
  req: PayloadRequest,
  input: Config['jobs']['tasks']['sendNotificationEmail']['input'],
): Promise<void> => {
  try {
    await req.payload.sendEmail(input)
  } catch (error) {
    req.payload.logger.error({
      err: error,
      msg: 'Notification delivery failed; retaining a queued retry.',
    })
    await req.payload.jobs.queue({
      task: 'sendNotificationEmail',
      queue: 'notifications',
      input,
      req,
      waitUntil: new Date(Date.now() + 60_000),
    })
  }
}
