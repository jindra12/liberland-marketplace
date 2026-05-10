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
- Start the app with `pnpm dev`
- Run unit and integration tests with `pnpm test:int`
- Run end-to-end tests with `pnpm test:e2e`

## Deployment

The repo includes deployment helpers for test installs and production rollout. See the scripts in the repository root for the current deployment flow.

## Notes

- This repo is not a generic Payload template anymore.
- It is the backend that powers the NSwap marketplace network.
- The exported test data in `testdata/` and `testdata1/` is part of the repo’s expected workflow.
