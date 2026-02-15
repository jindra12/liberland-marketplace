# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Liberland Marketplace — a Next.js 15 (App Router) + Payload CMS 3.74 application using MongoDB, TypeScript (strict), and Tailwind CSS 4. ESM project (`"type": "module"`). This project is used as backend and admin for the "Liberland Marketplace Frontend" project.

## Commands

```bash
pnpm install                # Install dependencies (pnpm 9/10 required)
pnpm dev                    # Start dev server at localhost:3000
pnpm build                  # Production build
pnpm lint                   # ESLint check
pnpm lint:fix               # ESLint auto-fix
pnpm test                   # Run all tests (integration + e2e)
pnpm test:int               # Integration tests only (vitest)
pnpm test:e2e               # E2E tests only (playwright)
pnpm generate:types         # Regenerate payload-types.ts after schema changes
pnpm generate:importmap     # Regenerate import map after creating/modifying admin components
```

Run a single integration test: `pnpm exec vitest run --config ./vitest.config.mts tests/int/<file>.int.spec.ts`

Validate TypeScript: `npx tsc --noEmit`

## Architecture

### Route Groups (App Router)
- `src/app/(frontend)/` — Public website routes (pages, posts, dynamic `[slug]`)
- `src/app/(payload)/` — Payload admin panel (`/admin`) and API routes (`/api/*`, `/api/graphql`)

### Payload CMS Structure
- **Collections** (`src/collections/`): Pages, Posts, Media, Categories, Users, Identities, Companies, Jobs
- **Globals** (`src/Header/config`, `src/Footer/config`): Header, Footer
- **Blocks** (`src/blocks/`): Layout builder blocks (ArchiveBlock, Banner, CallToAction, Code, Content, Form, MediaBlock, RelatedPosts)
- **Plugins** (`src/plugins/`): ecommerce (crypto payment adapter), SEO, search, form-builder, nested-docs, redirects, vercel-blob storage, custom `addCreatedBy`
- **Config**: `src/payload.config.ts`
- **Generated types**: `src/payload-types.ts` (do not edit manually)

### Key Patterns
- **Data fetching**: Server Components call Payload Local API via `getPayload({ config })`
- **Access control** (`src/access/`): `authenticated`, `anyone`, `authenticatedOrPublished`, `onlyOwnDocsOrAdmin`. Local API bypasses access control by default — always use `overrideAccess: false` with user context.
- **Hooks** (`src/hooks/`): Lifecycle hooks for revalidation and population. Always pass `req` to nested operations for transaction safety.
- **Styling**: Tailwind CSS utility classes + shadcn/ui components (`src/components/ui/`) + `class-variance-authority` for variants
- **Theme**: React Context providers in `src/providers/` (Theme, HeaderTheme) using `data-theme` attribute
- **Rich text**: Lexical editor (`src/fields/defaultLexical.ts`)
- **Heroes**: `src/heros/` — HighImpact, MediumImpact, LowImpact, PostHero

### Path Aliases
- `@/*` → `src/*`
- `@payload-config` → `src/payload.config.ts`

## Code Style

- Prettier: single quotes, no semicolons, trailing commas, 100 char width
- ESLint extends `next/core-web-vitals` and `next/typescript`
- **No inline styles** — use CSS classes (SCSS files with BEM naming) instead of `style={{ }}` props. For Payload admin components, use a co-located `index.scss` file with a `baseClass` pattern (see `src/components/BeforeDashboard/` for reference).

## Environment Variables

Required: `DATABASE_URL` (MongoDB), `PAYLOAD_SECRET`, `NEXT_PUBLIC_SERVER_URL`
Optional: `CRON_SECRET`, `PREVIEW_SECRET`

See `.env.example` for full list. Copy to `.env` before running.

## Important Notes

- Run `pnpm generate:types` after any collection/global schema changes
- Run `pnpm generate:importmap` after creating or modifying Payload admin components
- AGENTS.md and `.cursor/rules/` contain extensive Payload CMS development patterns — consult them for detailed guidance on access control, hooks, queries, security, and plugin development

## Testing with Playwright

After making changes that affect frontend behavior (UI changes, new features, bug fixes to interactions), **proactively** use the `playwright-cli` skill to visually verify the changes in the browser. This means:
- Start the dev server if not already running
- Navigate to the affected page(s) on backend running on localhost:3000 or the related frontend project running on localhost:3001
- Verify the change works as expected (elements render, interactions behave correctly)
- If issues are found, fix them and re-test
- Do this without being asked — it's part of the workflow for UI-affecting changes
