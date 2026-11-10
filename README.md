# NSWAP Backend

NSWAP is the backend and source-of-truth marketplace server for the NSwap frontend.

It provides the collections, APIs, auth, payment, publishing, and syndication data that the frontend consumes.

## What it contains

- Marketplace content models for companies, posts, jobs, products, ventures, tribes, comments, and syndications
- Auth and profile data
- Cart, order, transaction, and shipping data
- Likes, reports, subscriptions, and information requests
- Deployment helpers and test datasets
- Unit, integration, and end-to-end tests

## Primary roles

- Serve marketplace data to the frontend
- Support publishing and editing workflows
- Process commerce and payment-related flows
- Expose syndicated endpoints for networked marketplace discovery
- Keep production and test data aligned with the app model

## Local development

- Install dependencies with `pnpm install`
- Start the standalone test Mongo container with `pnpm dev:mongo`
- Start the app with `pnpm dev`
- Run unit and integration tests with `pnpm test:int`
- Run end-to-end tests with `pnpm test:e2e`

## Deployment

The repo includes deployment helpers for test installs and production rollout. See the scripts in the repository root for the current deployment flow.

### Database requirements

Standalone MongoDB is supported. Order completion, inventory, seller fulfillment,
venture membership and search rebuilding do not require a replica set or reject
requests because transactions are unavailable. Use the existing standalone
`DATABASE_URL`; no topology change is needed.

Database transactions are explicitly disabled. Operational writes use conditional
single-document updates with a private compare-and-swap token and bounded conflict
retries, not a process-local mutex. Stock deductions and purchase counts save an
order receipt in the same document as the changed value, so concurrent requests or
interrupted retries cannot apply that line twice. Verified payment claims and
per-order crypto transaction keys are database-unique.

Multi-item work is resumable, not an all-or-nothing multi-document transaction.
Only successful completion of every line sets the order-level receipt. If a later
line fails, retry the same order; already applied lines are retained and skipped.
Do not delete its private receipts or move a verified payment to another order.
Insufficient stock returns a conflict instead of making inventory negative or
clamping it. The completion status and a private counting-start marker are written
together, so a failure before the first after-change handler remains recoverable.
Ordinary edits do not replay historical counts on completed orders that predate
these markers. Historical manual stock deductions without receipts cannot be
inferred; reconcile those before explicitly applying inventory to legacy orders.

Search rebuilds prepare a private staging collection, then publish it using a
[same-database collection rename](https://www.mongodb.com/docs/v8.0/reference/command/renamecollection/).
The database account needs the corresponding rename privilege. Preparation or
insertion failure leaves the live index untouched. Concurrent successful rebuilds
each publish a complete index; the last published snapshot wins.

Payload initializes indexes on startup. Resolve any historical duplicate-key errors
before serving traffic; payment claims, initial-administrator selection and AI
publication rely on database-enforced uniqueness. Failed email deliveries persist
in administrator-only Payload jobs, retried by the running server every minute.

Security regression tests create their own disposable standalone databases and
force actual conditional-write collisions, duplicate requests and interrupted
multi-step operations. They do not require changing the production database.

## Notes

- This repo is not a generic Payload template anymore.
- It is the backend that powers the NSwap marketplace network.
- The exported test data in `testdata/` and `testdata1/` is part of the repo’s expected workflow.
