# Gatekeeper

Open-source (**AGPL-3.0**) AI principal — a person's front door for inbound requests.

Inspired by Andrew D'Souza's essay ["Principals"](https://www.andrewdsouza.com/): agents are untrusted; principals have their own reputation and can say no.

## What it does

Anyone (human or AI agent) who wants to reach a user sends a request to that user's Gatekeeper. Gatekeeper judges it against the user's plain-English rules, rejects spam and bad fits, and only delivers **double-opt-in intros**. Its public ledger (requests, accept rate, spam blocked) is its reputation.

## Audience

Worldwide, starting with indie SaaS founders and remote tech hiring.

## Stack

| Layer | Choice |
| --- | --- |
| API | Node.js + TypeScript + Fastify |
| Web | Next.js + Tailwind |
| DB | Postgres + pgvector (Railway Hobby), Drizzle ORM |
| LLM | Gemini Flash (default) + Gemini embeddings; Groq fallback; swappable `llm.ts` |
| Email | Resend |
| Auth | Auth.js magic links (later) |
| Payments | Lemon Squeezy / Paddle (later; Stripe not available in Pakistan) |
| CI | GitHub Actions |

## Monorepo layout

```
apps/api       Fastify API
apps/web       Next.js frontend
packages/db    Drizzle schema + Postgres/pgvector scaffolding
```

## Local setup

Prerequisites: **Node.js ≥ 20**, **pnpm 9**.

```bash
pnpm install
cp .env.example .env
# fill DATABASE_URL and API keys as needed
```

### Scripts

```bash
pnpm lint          # ESLint across workspaces
pnpm test          # minimal workspace tests
pnpm format:check  # Prettier
pnpm dev           # API (:4000) + web (:3000) in parallel
pnpm build         # build db, api, web
```

API health check: `GET http://localhost:4000/health`

## Deploy (Railway)

Each app has a `railway.toml`:

- `apps/api` — build `@gatekeeper/db` then `@gatekeeper/api`; start API; health at `/health`
- `apps/web` — build and start Next.js; health at `/`

Set env vars from `.env.example` in Railway for both services (and attach a Postgres + pgvector plugin for `DATABASE_URL`).

## License

[AGPL-3.0](./LICENSE)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
