'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  if (error) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Verification Failed</CardTitle>
          <CardDescription>
            {error === 'EXPIRED_TOKEN'
              ? 'This verification link has expired. Please sign up again or request a new link.'
              : 'This verification link is invalid. Please check the link and try again.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <Button asChild className="w-full">
            <Link href="/signup">Back to Sign Up</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle>Email Verified</CardTitle>
        <CardDescription>Your email address has been successfully verified.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <Button asChild className="w-full">
          <a href={process.env.NEXT_PUBLIC_FRONTEND_URL || '/'}>Continue to Marketplace</a>
        </Button>
      </CardContent>
    </Card>
  )
}

export default function VerifyEmailSuccessPage() {
  return (
    <div className="container flex min-h-[60vh] items-center justify-center py-20">
      <Suspense>
        <VerifyEmailContent />
      </Suspense>
    </div>
  )
}
