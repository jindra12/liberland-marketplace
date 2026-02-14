'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GoogleLogo } from '@/components/icons/GoogleLogo'
import { ComingSoonProviders } from '@/components/ComingSoonProviders'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [queryString, setQueryString] = useState('')

  useEffect(() => {
    setQueryString(window.location.search)
  }, [])

  const getRedirectURL = () => {
    if (queryString) {
      return `/api/auth/oauth2/authorize${queryString}`
    }
    return '/'
  }

  const handleEmailLogin = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await authClient.signIn.email({ email, password })
      if (result.error) {
        setError(result.error.message || 'Sign in failed')
        setLoading(false)
        return
      }
      router.push(getRedirectURL())
    } catch {
      setError('An unexpected error occurred')
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError('')
    await authClient.signIn.social({
      provider: 'google',
      callbackURL: getRedirectURL(),
    })
  }

  return (
    <div className="container flex min-h-[60vh] items-center justify-center py-20">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Log In</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <Button
            variant="outline"
            size="lg"
            className="w-full border-gray-300 bg-white text-base text-gray-700 hover:bg-gray-50 hover:text-gray-700"
            onClick={handleGoogleLogin}
            type="button"
          >
            <GoogleLogo className="size-5" />
            Sign in with Google
          </Button>

          <ComingSoonProviders action="Sign in" />

          <div className="flex items-center gap-4">
            <div className="bg-border h-px flex-1" />
            <span className="text-muted-foreground text-sm">or</span>
            <div className="bg-border h-px flex-1" />
          </div>

          <form onSubmit={handleEmailLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <p className="text-muted-foreground text-center text-sm">
            Don&apos;t have an account?{' '}
            <Link href={`/signup${queryString}`} className="text-primary underline">
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
