# Hosted checkout and merchant webhooks

Companies configure a public HTTPS webhook URL and an Ethereum-compatible receiving wallet.
The company edit/create form in Nswap links to the complete integration guide. Saving a
company lets its owner or an admin click **Generate secret** from Edit. Copy the one-time
value to the merchant backend before dismissing it. It cannot be retrieved later. Once a
secret exists, only **Rotate secret** is offered; losing the value requires rotation.
Never embed the secret in a Dart application, browser bundle or public URL.

The signing secret is hidden from ordinary company REST/GraphQL reads, including owner and
admin reads. The dedicated `companyPaymentSettings(companyId: String!)` GraphQL query requires
an authenticated company creator or backend admin. It returns `companyId`, `paymentWebhookUrl`
and `hasWebhookSecret`, never the signing value, with `Cache-Control: private, no-store`. The frontend only calls it
inside the guarded edit form, scopes its separate query cache to the backend/account, and
discards the cached settings when that form unmounts. Public `CompanyById` never selects
payment integration settings.

`generateCompanyPaymentSecret(companyId: String!)` issues the initial secret and refuses
to reveal an existing value. `rotateCompanyPaymentSecret(companyId: String!)` replaces it.
Both mutations enforce owner/admin authorization and return the new `{ companyId, secret }`
only in that successful response. Save it before leaving the page: a lost response also
requires rotation. The frontend keeps the value only in component memory, not query or
mutation caches or browser storage.

New keys live in a private, unversioned credential collection. Company edits and history
restoration cannot roll a key back. Existing legacy company credentials remain valid until
the first explicit rotation, but cannot be read through any public or owner settings API.
Rotation immediately invalidates the previous key for new signed session requests. Pending
webhook deliveries sign with the current key; in-flight requests may already carry an old
signature. Update your receiving backend immediately; failed deliveries will retry.

## Operator setup

Each syndicated marketplace operator configures its own Thirdweb project, not each company.
Set `THIRDWEB_CLIENT_ID` to that project's public client ID. In Thirdweb Bridge > Webhooks,
register `https://YOUR_BACKEND/api/checkout/thirdweb` and set `THIRDWEB_WEBHOOK_SECRET` to
the supplied webhook secret. Configure `NEXT_PUBLIC_FRONTEND_URL` to the Nswap frontend.
Independent operators must not share the project webhook secret. The frontend obtains the
public client ID from the session so it uses the correct backend's project.

Console registration is possible through the dashboard's account-authenticated
`POST https://bridge.thirdweb.com/v1/developer/webhooks` API. Its dashboard client sends
an account bearer token, `x-client-id`, `x-team-id`, and JSON `{ label, url, secret, version: 2 }`.
This is the dashboard management API, not a documented Bridge SDK registration method;
project-secret-key authentication has not been verified. Keep account login tokens out of app configuration.

Payment notifications use Payload's durable jobs queue (`notifications`), its automatic worker,
exponential retries and exclusive per-session task concurrency. Ensure the worker is running
in production. Failed jobs are visible to admins in Payload's jobs collection; investigate and
requeue exhausted jobs. No replicas or database transactions are required.

Hosted USD-priced checkout settles in **USDC on Base**, chain ID 8453, token
`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, six decimals. Thirdweb offers the available
crypto and card routes; fees, minimums, supported regions and customer verification vary.
No Nswap user account is required. This separate hosted integration does not create a cart
order, reserve product inventory, collect a shipping address or fulfill goods automatically.
The receiving merchant is responsible for fulfillment.

## Links and sessions

### Normal cart orders

Company owners can enable **Accept card and crypto payments through Thirdweb**, off by
default. This consents to USDC-on-Base payouts, not ETH-on-Ethereum payouts. It is separate
from donation settings and requires no company notification URL or company signing secret.
All companies in one shared-wallet payment group must opt in.

The operator registers and tests `/api/checkout/thirdweb` in the Thirdweb dashboard once,
then enables **Admin > Marketplace payments > Enable Thirdweb order checkout**.
That setting is an explicit setup acknowledgment, not an automated provider-health check.
The admin screen displays the callback URL derived from `NEXT_PUBLIC_SERVER_URL`.

Signed completed callbacks validate the order's saved recipient, USD amount, settlement
chain and token. They save the receipt and queue durable `confirmThirdwebOrder` work before
attempting immediate confirmation. The existing notifications worker retries interrupted
confirmation without a browser. Orders complete only after every recipient has paid;
inventory and seller fulfillment use the existing order flow. Never accept browser success
as proof of settlement.

### Separate hosted checkout

A reusable donation link is:

```text
https://YOUR_FRONTEND/pay?serverUrl=https%3A%2F%2FYOUR_BACKEND&companyId=COMPANY_ID
```

Append `productId=PRODUCT_ID&quantity=1` for a product. Product prices and receiving wallets
come from authoritative backend records. Donation amounts are selected by the donor, from
$1 to $1,000,000. Sessions expire for new checkout after 24 hours. A late verified settlement
is still recorded, so closing the browser or an expired link cannot hide money already paid.

For an external account/order reference, create a session from the merchant backend:

```ts
import { createHmac } from 'node:crypto'
import stringify from 'fast-json-stable-stringify'

const input = {
  companyId: 'COMPANY_ID',
  amountUsdCents: 1000,
  externalReference: 'donation-123',
  returnUrl: 'https://YOUR_APP/thank-you?orderId=donation-123',
}
const timestamp = String(Math.floor(Date.now() / 1000))
const signature = createHmac('sha256', process.env.NSWAP_WEBHOOK_SECRET)
  .update(`${timestamp}.${stringify(input)}`).digest('hex')
const response = await fetch('https://YOUR_BACKEND/api/graphql', {
  method: 'POST',
  body: JSON.stringify({
    query: `mutation CreateHostedCheckoutSession($input: HostedCheckoutInput!) {
      createHostedCheckoutSession(input: $input) { sessionId checkoutUrl }
    }`,
    variables: { input },
  }),
  headers: {
    'Content-Type': 'application/json',
    'X-Nswap-Timestamp': timestamp,
    'X-Nswap-Signature': signature,
  },
})
const { data, errors } = await response.json()
if (!response.ok || errors?.length) {
  throw new Error(errors?.[0]?.message || 'Checkout creation failed')
}
const { checkoutUrl } = data.createHostedCheckoutSession
// Open checkoutUrl from the mobile/web application.
```

Use `productId` and optional `quantity` instead of `amountUsdCents` for products. Signing
is mandatory when supplying `externalReference` or `returnUrl`; anonymous callers can create unreferenced
donation/product sessions. Read status using the `hostedCheckoutSession(sessionId: String!)`
GraphQL query. Public responses exclude references and webhook credentials.
Sign canonical input JSON, not the GraphQL request envelope. Existing REST session endpoints
remain compatible for external integrations; those signatures still cover the raw REST body.
Use opaque references, not personal information. Amounts in USD are integer cents.

The optional return URL is saved with the signed session and shown as **Return to app** after
payment verification. It must use HTTPS (HTTP localhost is allowed for development), without
credentials, and is limited to 2,048 characters. URL parameters on the checkout page cannot
override it. The return visit is not proof of payment; use the verified webhook for fulfillment.

## Notification contract

Successful verified settlement produces a `payment.completed` JSON event with:

- `version`, `id`, `type`, `createdAt`, `serverUrl`, `sessionId`, `companyId`, `productId`.
- `kind` (`donation` or `product`), `quantity`, `externalReference`, `requestedAmountUsdCents`.
- `settlement`: receiver, chainId, tokenAddress, tokenSymbol, amount and decimals.
  `amount` is a decimal string of integer token units (10 USDC = `"10000000"`).
- `verification`: provider, verifiedAt, signatureVerified, completed, receiverMatched,
  chainMatched, tokenMatched and amountSatisfied. These report checks performed by this backend.
- `thirdweb`: paymentId, **unmodified rawBody**, original provider signatureHeaders, and
  destination transaction hashes with their chain IDs. The raw body contains the provider data.

The endpoint only accepts correctly signed Thirdweb events for the recorded recipient, chain,
token and sufficient amount, with a completed destination transaction. A provider payment ID
can belong to only one session. Pending and failed events do not authorize fulfillment.

Merchant delivery includes `X-Nswap-Event-Id`, `X-Nswap-Timestamp` (Unix seconds), and
`X-Nswap-Signature` (hexadecimal HMAC-SHA256 of `timestamp + '.' + exact raw body`, signed
with the company's secret). Reject malformed signatures and timestamps older/newer than five
minutes; compare equal-length signature buffers with `timingSafeEqual` before parsing JSON.
Durably deduplicate `id` before crediting the account. Return HTTP 2xx after safely accepting
the event. Delivery is at-least-once, not exactly-once. Original Thirdweb evidence stays stable
across retries; our delivery timestamp and signature are refreshed.

Thirdweb signatures are shared-secret HMACs, **not public certificates**. Merchants can verify
our signature and independently inspect destination transactions, but cannot verify Thirdweb's
HMAC without the operator's secret. Do not disclose that secret or treat a browser success
callback as proof of payment. Webhook destinations must be public HTTPS URLs; redirects are
disabled and DNS-safe fetching blocks private/internal destinations at connection time.
