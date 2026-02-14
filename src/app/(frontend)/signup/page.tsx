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

export default function SignupPage() {
  const router = useRouter()
  const [name, setName] = useState('')
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

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await authClient.signUp.email({ name, email, password })
      if (result.error) {
        setError(result.error.message || 'Sign up failed')
        setLoading(false)
        return
      }
      router.push(getRedirectURL())
    } catch {
      setError('An unexpected error occurred')
      setLoading(false)
    }
  }

  const handleGoogleSignup = async () => {
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
          <CardTitle>Sign Up</CardTitle>
          <CardDescription>Create a new account</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <Button
            variant="outline"
            size="lg"
            className="w-full border-gray-300 bg-white text-base text-gray-700 hover:bg-gray-50 hover:text-gray-700"
            onClick={handleGoogleSignup}
            type="button"
          >
            <GoogleLogo className="size-5" />
            Sign up with Google
          </Button>

          <ComingSoonProviders action="Sign up" />

          <div className="flex items-center gap-4">
            <div className="bg-border h-px flex-1" />
            <span className="text-muted-foreground text-sm">or</span>
            <div className="bg-border h-px flex-1" />
          </div>

          <form onSubmit={handleSignup} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
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
              {loading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>

          <p className="text-muted-foreground text-center text-sm">
            Already have an account?{' '}
            <Link href={`/login${queryString}`} className="text-primary underline">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
