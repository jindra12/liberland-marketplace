import * as ipaddr from 'ipaddr.js'
import { lookup } from 'node:dns/promises'

import { ShareApiError } from './utils'

const MAX_REDIRECTS = 5

const isBlockedParsedAddress = (
  address: ipaddr.IPv4 | ipaddr.IPv6,
): boolean => {
  if (address instanceof ipaddr.IPv6) {
    if (address.range() === 'ipv4Mapped') {
      return isBlockedParsedAddress(address.toIPv4Address())
    }
  }

  return address.range() !== 'unicast'
}

const isBlockedIPAddress = (address: string): boolean => {
  if (!ipaddr.isValid(address)) {
    return true
  }

  return isBlockedParsedAddress(ipaddr.parse(address))
}

const isSafeHostname = async (hostname: string): Promise<boolean> => {
  const normalized = hostname.toLowerCase()

  if (normalized === 'localhost') {
    return false
  }

  if (ipaddr.isValid(normalized)) {
    return !isBlockedIPAddress(normalized)
  }

  const addresses = await lookup(hostname, {
    all: true,
    verbatim: false,
  }).catch(() => [])

  return (
    Array.isArray(addresses) &&
    addresses.length > 0 &&
    addresses.every((entry) => !isBlockedIPAddress(entry.address))
  )
}

const isRedirectStatus = (status: number): boolean => status >= 300 && status < 400

export const resolveSafeURL = async (value: string): Promise<URL | null> => {
  try {
    const parsed = new URL(value)

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }

    if (!(await isSafeHostname(parsed.hostname))) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export const fetchSafeURLResponse = async (inputURL: URL): Promise<Response> => {
  let currentURL = inputURL

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    if (!(await isSafeHostname(currentURL.hostname))) {
      throw new ShareApiError('link must not target a private or local address.', 400)
    }

    const response = await fetch(currentURL, {
      redirect: 'manual',
    })

    if (!isRedirectStatus(response.status)) {
      return response
    }

    const location = response.headers.get('location')

    if (!location) {
      throw new ShareApiError('Redirect response is missing a Location header.', 400)
    }

    const nextURL = new URL(location, currentURL)

    if (nextURL.protocol !== 'http:' && nextURL.protocol !== 'https:') {
      throw new ShareApiError('link must be an http(s) URL.', 400)
    }

    currentURL = nextURL
  }

  throw new ShareApiError('Too many redirects while fetching the link.', 400)
}
