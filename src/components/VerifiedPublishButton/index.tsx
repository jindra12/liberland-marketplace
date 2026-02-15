'use client'
import React, { useCallback, useState } from 'react'
import { PublishButton, useAuth } from '@payloadcms/ui'
import useCountdown from '@bradgarropy/use-countdown'
import type { User } from '@/payload-types'
import './index.scss'

const baseClass = 'verified-publish-button'
const COOLDOWN_SECONDS = 60

export default function VerifiedPublishButton() {
  const { user } = useAuth<User>()
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const countdown = useCountdown({
    seconds: COOLDOWN_SECONDS,
    autoStart: false,
  })

  const isCoolingDown = countdown.isRunning

  const handleResend = useCallback(async () => {
    if (!user?.email || sending) return

    setSending(true)
    setError('')
    setSent(false)

    try {
      const res = await fetch('/api/auth/send-verification-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          callbackURL: '/verify-email-success',
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to send verification email')
      }

      setSent(true)
      countdown.reset({ minutes: 0, seconds: COOLDOWN_SECONDS })
    } catch {
      setError('Could not send email. Try again later.')
    } finally {
      setSending(false)
    }
  }, [user?.email, sending, countdown])

  if (user?.role?.includes('admin') || user?.emailVerified) {
    return <PublishButton />
  }

  const secondsLeft = countdown.minutes * 60 + countdown.seconds

  return (
    <div className={baseClass}>
      <button type="button" disabled className="btn btn--style-primary btn--size-medium">
        Publish
      </button>
      <span className={`${baseClass}__message`}>Verify your email to publish</span>
      <button
        type="button"
        disabled={sending || isCoolingDown}
        onClick={handleResend}
        className={`${baseClass}__resend`}
      >
        {sending
          ? 'Sending...'
          : isCoolingDown
            ? `Resend in ${secondsLeft}s`
            : 'Resend verification email'}
      </button>
      {sent && (
        <span className={`${baseClass}__success`}>Verification email sent!</span>
      )}
      {error && (
        <span className={`${baseClass}__error`}>{error}</span>
      )}
    </div>
  )
}
