# Gatekeeper

![Gatekeeper](./docs/media/github-banner.png)

Open-source (**AGPL-3.0**) AI principal — a person's front door for inbound requests.

**Your AI front door that says no for you.**

<p>
  <img src="./apps/web/public/icon-512.png" alt="Door mark" width="48" height="48" />
  &nbsp;
  <img src="./docs/media/art-door-mark.png" alt="Front door art" width="72" height="54" />
  &nbsp;
  <img src="./docs/media/art-ledger-trust.png" alt="Ledger trust art" width="72" height="54" />
  &nbsp;
  <img src="./docs/media/art-says-no.png" alt="Says no art" width="72" height="54" />
</p>

Brand & product art: [docs/media/](./docs/media/) · App icons & OG: [apps/web/public/](./apps/web/public/)

Inspired by Andrew D'Souza's essay ["Principals"](https://www.andrewdsouza.com/): agents are untrusted; principals have their own reputation and can say no.

![Gatekeeper demo](./docs/media/demo.gif)

> Placeholder GIF — replace with a real recording. See [docs/LAUNCH.md](./docs/LAUNCH.md) and `./scripts/generate-demo-gif-placeholder.sh`.

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

### Payments (Lemon Squeezy, feature-flagged)

```bash
# off by default
PAYMENTS_ENABLED=false
```

When `PAYMENTS_ENABLED=true`, configure Lemon env vars (see `.env.example`), point webhooks to
`POST /v1/payments/webhooks/lemon`, then use `/dashboard/billing` for Pro ($9/mo) and credit packs.
Optional `stakeCents: 100` on intro requests holds $1 — refunded on accept, forfeited to the receiver on spam. Pay-per-accepted-intro deducts `INTRO_CREDIT_CENTS` from the sender when the receiver Accepts.

With the flag off, checkout returns 503, stakes/credits are skipped, and webhooks no-op.

### Public ledger & trust


- Global: http://localhost:3000/ledger  
- Per user: http://localhost:3000/@handle/ledger  
- Trust score = helpful ratings / delivered intros  
- After a receiver Accepts, the intro email includes **Was this intro helpful?** Yes/No links (API console prints them when `RESEND_API_KEY` is unset)

```bash
curl http://localhost:4000/v1/ledger
curl http://localhost:4000/v1/users/ada/ledger
```

### Agent API


```bash
# docs for agents
curl http://localhost:4000/llms.txt
curl http://localhost:4000/openapi.json

# create a key at http://localhost:3000/dashboard/keys (sign in first)

curl -X POST http://localhost:4000/v1/requests \
  -H "Authorization: Bearer gk_…" \
  -H "content-type: application/json" \
  -d '{"targetHandle":"ada","senderName":"ResearchBot","senderContact":"ops@example.com","message":"…"}'
```

Per-key hourly limits + per-IP 30/min. Dashboard: `/dashboard/keys`.

### Double opt-in emails


After judging:

- **accept** → status `delivered` → receiver gets Accept/Decline links (signed, 72h)
- receiver **Accept** → status `accepted` → one intro email to both parties
- receiver **Decline** → status `declined`
- **reject/spam** → sender gets `reason_public` + `suggested_rewrite` (status stays `pending`)

Without `RESEND_API_KEY`, the API prints full email bodies (including Accept/Decline URLs) to the **API console**.

```bash
pnpm --filter @gatekeeper/api test
# focused:
node --import tsx --test apps/api/src/opt-in.test.ts apps/api/src/email.test.ts apps/api/src/tokens.test.ts
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


Schema: `users`, `gate_rules`, `requests`, `api_keys`, `abuse_events`, plus monthly `ledger_stats` view. Migrations enable **pgvector**.

```bash
# requires DATABASE_URL (Postgres with permission to create the vector extension)
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gatekeeper
pnpm --filter @gatekeeper/db db:migrate
pnpm --filter @gatekeeper/db db:seed   # demo users @ada @jonas @mira
```

Regenerate SQL after schema edits: `pnpm --filter @gatekeeper/db db:generate`

### Launch checklist

Production go-live steps (Railway, domain, Resend verification, demo GIF): **[docs/LAUNCH.md](./docs/LAUNCH.md)**.

Privacy: [/privacy](http://localhost:3000/privacy) when running locally.

## Deploy (Railway)

Each app has a `railway.toml`:

- `apps/api` — build `@gatekeeper/db` then `@gatekeeper/api`; start API; health at `/health`
- `apps/web` — build and start Next.js; health at `/`

Set env vars from `.env.example` in Railway for both services (and attach a Postgres + pgvector plugin for `DATABASE_URL`). Full checklist: [docs/LAUNCH.md](./docs/LAUNCH.md).

## License

[AGPL-3.0](./LICENSE)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
