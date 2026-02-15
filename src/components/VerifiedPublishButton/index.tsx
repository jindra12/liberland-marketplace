'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { PublishButton, useAuth } from '@payloadcms/ui'
import type { User } from '@/payload-types'
import './index.scss'

const baseClass = 'verified-publish-button'
const COOLDOWN_SECONDS = 60

export default function VerifiedPublishButton() {
  const { user } = useAuth<User>()
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current)
    }
  }, [])

  const startCooldown = useCallback(() => {
    setSecondsLeft(COOLDOWN_SECONDS)
    cooldownRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current)
          cooldownRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  const handleResend = useCallback(async () => {
    if (!user?.email || sending || secondsLeft > 0) return

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
      startCooldown()
    } catch {
      setError('Could not send email. Try again later.')
    } finally {
      setSending(false)
    }
  }, [user?.email, sending, secondsLeft, startCooldown])

  if (user?.role?.includes('admin') || user?.emailVerified) {
    return <PublishButton />
  }

  return (
    <div className={baseClass}>
      <button type="button" disabled className="btn btn--style-primary btn--size-medium">
        Publish
      </button>
      <span className={`${baseClass}__message`}>Verify your email to publish</span>
      <button
        type="button"
        disabled={sending || secondsLeft > 0}
        onClick={handleResend}
        className={`${baseClass}__resend`}
      >
        {sending
          ? 'Sending...'
          : secondsLeft > 0
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
