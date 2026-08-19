'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [queryString, setQueryString] = useState('')

  useEffect(() => {
    setQueryString(window.location.search)
  }, [])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const resetURL = new URL('/reset-password', window.location.origin)
      if (queryString) {
        resetURL.searchParams.set('loginQuery', queryString)
      }

      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: resetURL.toString(),
      })

      if (result.error) {
        setError(result.error.message || 'Unable to request a password reset')
      } else {
        setSubmitted(true)
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container flex min-h-[60vh] items-center justify-center py-20">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Forgot Password</CardTitle>
          <CardDescription>Enter your email and we&apos;ll send you a reset link.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {submitted ? (
            <p className="text-center text-sm">
              If an account exists for that email address, a password reset link has been sent.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              {error && <p className="text-destructive text-sm">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </Button>
            </form>
          )}
          <Link href={`/login${queryString}`} className="text-primary text-center text-sm underline">
            Back to log in
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
