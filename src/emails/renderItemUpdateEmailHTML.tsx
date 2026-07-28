import { render } from '@react-email/render'

import { ItemUpdateEmail, type ItemUpdateEmailProps } from '@/emails/ItemUpdateEmail'

export const renderItemUpdateEmailHTML = async (props: ItemUpdateEmailProps): Promise<string> =>
  render(<ItemUpdateEmail {...props} />)
