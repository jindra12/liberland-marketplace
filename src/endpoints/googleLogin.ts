import { OAuth2Client } from 'google-auth-library'
import { generatePayloadCookie, jwtSign } from 'payload'
import type { Endpoint, SanitizedCollectionConfig } from 'payload'
import crypto from 'crypto'

const client = new OAuth2Client()

export const googleLoginEndpoint: Endpoint = {
  path: '/google-login',
  method: 'post',
  handler: async (req) => {
    const googleClientId = process.env.GOOGLE_CLIENT_ID
    if (!googleClientId) {
      return Response.json({ error: 'Google login is not configured' }, { status: 500 })
    }

    let idToken: string | undefined
    try {
      const body = await req.json?.()
      idToken = body?.idToken
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 })
    }

    if (!idToken || typeof idToken !== 'string') {
      return Response.json({ error: 'idToken is required' }, { status: 400 })
    }

    let googlePayload: { email?: string; name?: string; sub?: string }
    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: googleClientId,
      })
      const p = ticket.getPayload()
      if (!p || !p.email) {
        return Response.json({ error: 'Invalid token payload' }, { status: 401 })
      }
      googlePayload = { email: p.email, name: p.name, sub: p.sub }
    } catch {
      return Response.json({ error: 'Invalid or expired ID token' }, { status: 401 })
    }

    const { email, name, sub: googleSub } = googlePayload

    try {
      // Look up by googleSub first, then by email
      let existingUser = null
      if (googleSub) {
        const bySub = await req.payload.find({
          collection: 'users',
          where: { googleSub: { equals: googleSub } },
          limit: 1,
        })
        if (bySub.docs.length > 0) {
          existingUser = bySub.docs[0]
        }
      }

      if (!existingUser && email) {
        const byEmail = await req.payload.find({
          collection: 'users',
          where: { email: { equals: email } },
          limit: 1,
        })
        if (byEmail.docs.length > 0) {
          existingUser = byEmail.docs[0]

          // Link the Google account if not already linked
          if (googleSub && !existingUser.googleSub) {
            await req.payload.update({
              collection: 'users',
              id: existingUser.id,
              data: { googleSub },
            })
          }
        }
      }

      if (!existingUser) {
        const randomPassword = crypto.randomBytes(32).toString('hex')
        existingUser = await req.payload.create({
          collection: 'users',
          data: {
            email: email!,
            name: name || email!,
            password: randomPassword,
            googleSub: googleSub || undefined,
          },
        })
      }

      // Generate JWT and cookie manually (we don't have the user's password)
      const usersCollection = req.payload.config.collections.find(
        (c) => c.slug === 'users',
      ) as SanitizedCollectionConfig | undefined
      const collectionAuthConfig = usersCollection?.auth
      const tokenExpiration = collectionAuthConfig?.tokenExpiration ?? 7200

      const fieldsToSign: Record<string, unknown> = {
        id: existingUser.id,
        collection: 'users',
        email: existingUser.email,
      }

      const { token, exp } = await jwtSign({
        fieldsToSign,
        secret: req.payload.config.secret,
        tokenExpiration,
      })

      const cookie = generatePayloadCookie({
        collectionAuthConfig: collectionAuthConfig!,
        cookiePrefix: req.payload.config.cookiePrefix,
        token,
      })

      return Response.json(
        { user: existingUser, token, exp },
        {
          status: 200,
          headers: { 'Set-Cookie': cookie },
        },
      )
    } catch (error) {
      req.payload.logger.error({ err: error }, 'Google login error')
      return Response.json({ error: 'Authentication failed' }, { status: 500 })
    }
  },
}
