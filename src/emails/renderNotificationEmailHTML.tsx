import { render } from '@react-email/render'

import { NotificationEmail, type NotificationEmailProps } from '@/emails/NotificationEmail'

export const renderNotificationEmailHTML = async (props: NotificationEmailProps): Promise<string> =>
  render(<NotificationEmail {...props} />)
