import nodemailer from 'nodemailer'

type AuthEmail = {
  to: string
  subject: string
  html: string
}

export const sendAuthEmail = async (email: AuthEmail): Promise<void> => {
  const smtpTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
  const fromAddress = process.env.SMTP_FROM_ADDRESS || 'noreply@nswap.io'
  const fromName = process.env.SMTP_FROM_NAME || 'Nswap Marketplace'

  await smtpTransport.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    ...email,
  })
}
