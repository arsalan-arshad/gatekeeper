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

### LLM layer (`apps/api`)

Swappable providers via `LLM_PROVIDER` (`gemini` default, `groq`, `xai`). Embeddings always use Gemini (`text-embedding-004`) — set `GEMINI_API_KEY` even when chatting through Groq/xAI.

```bash
pnpm --filter @gatekeeper/api test
```

### Judging engine

```bash
pnpm --filter @gatekeeper/api test
# focused:
node --import tsx --test apps/api/src/judge.test.ts
```

`judgeRequest` embeds the inbound message, scores cosine similarity vs the profile embedding, asks the LLM for strict JSON, then accepts only when `score >= min_relevance` and no deal-breaker was hit. `reason_public` is sanitized so private gate rules never leak.

### Onboarding (`/start`)


1. Start API + web: `pnpm dev`
2. Set `DATABASE_URL`, `AUTH_SECRET`, and optionally `GEMINI_API_KEY` / `RESEND_API_KEY` in `.env` (see `.env.example`).
3. Apply migrations: `pnpm --filter @gatekeeper/db db:migrate`
4. Open [http://localhost:3000/start](http://localhost:3000/start), enter your email, then open the magic link (printed in the **web** console when `RESEND_API_KEY` is unset).
5. Answer the five interview questions, edit your gate rules, publish — then visit `/@your-handle`.

### Database (`packages/db`)


Schema: `users`, `gate_rules`, `requests`, `api_keys`, plus monthly `ledger_stats` view. Migrations enable **pgvector**.

```bash
# requires DATABASE_URL (Postgres with permission to create the vector extension)
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gatekeeper
pnpm --filter @gatekeeper/db db:migrate
```

Regenerate SQL after schema edits: `pnpm --filter @gatekeeper/db db:generate`

## Deploy (Railway)

Each app has a `railway.toml`:

- `apps/api` — build `@gatekeeper/db` then `@gatekeeper/api`; start API; health at `/health`
- `apps/web` — build and start Next.js; health at `/`

Set env vars from `.env.example` in Railway for both services (and attach a Postgres + pgvector plugin for `DATABASE_URL`).

## License

[AGPL-3.0](./LICENSE)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
