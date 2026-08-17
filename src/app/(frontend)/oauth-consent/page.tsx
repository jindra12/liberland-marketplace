'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type ConsentResponse = {
  redirectURI?: string
  error?: string
  message?: string
}

export default function OAuthConsentPage() {
  const [consentCode, setConsentCode] = useState('')
  const [clientId, setClientId] = useState('')
  const [scope, setScope] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setConsentCode(params.get('consent_code') || '')
    setClientId(params.get('client_id') || '')
    setScope(params.get('scope') || '')
  }, [])

  const submitConsent = async (accept: boolean) => {
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/auth/oauth2/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept, consent_code: consentCode }),
      })
      const result = await response.json() as ConsentResponse

      if (!response.ok || !result.redirectURI) {
        setError(result.message || result.error || 'Unable to process consent.')
        setLoading(false)
        return
      }

      window.location.assign(result.redirectURI)
    } catch (requestError) {
      console.error('OAuth consent request failed.', requestError)
      setError('Unable to process consent.')
      setLoading(false)
    }
  }

  return (
    <div className="container flex min-h-[60vh] items-center justify-center py-20">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Authorize MCP access</CardTitle>
          <CardDescription>
            Allow this application to access your Nswap account using the requested permissions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="mb-6 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="font-medium">Application</dt>
              <dd className="break-all text-right">{clientId || 'MCP client'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="font-medium">Permissions</dt>
              <dd className="break-all text-right">{scope || 'Account access'}</dd>
            </div>
          </dl>

          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault()
              submitConsent(true)
            }}
            className="flex gap-3"
          >
            <Button type="submit" disabled={loading || !consentCode} className="flex-1">
              Allow
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={loading || !consentCode}
              onClick={() => submitConsent(false)}
              className="flex-1"
            >
              Deny
            </Button>
          </form>

          {error && <p className="text-destructive mt-4 text-sm">{error}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
