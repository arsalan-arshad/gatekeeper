# Gatekeeper

![Gatekeeper](./docs/media/github-banner.png)

Open-source (**AGPL-3.0**) AI principal — a person's front door for inbound requests.

**Your AI front door that says no for you.**

<p>
  <img src="./apps/web/public/icon-512.png" alt="Principal seal" width="48" height="48" />
  &nbsp;
  <img src="./docs/media/art-principal-mark.png" alt="Principal seal art" width="72" height="54" />
  &nbsp;
  <img src="./docs/media/art-ledger-trust.png" alt="Reputation ledger art" width="72" height="54" />
  &nbsp;
  <img src="./docs/media/art-says-no.png" alt="Says no art" width="72" height="54" />
</p>

Brand & product art (principal seal): [docs/media/](./docs/media/) · App icons & OG: [apps/web/public/](./apps/web/public/)

Inspired by Andrew D'Souza's essay ["Principals"](https://www.andrewdsouza.com/): agents are untrusted; principals have their own reputation and can say no.

![Gatekeeper product screenshot](./docs/media/product-screenshot.png)

> Product screenshot (Open Graph art). For a motion demo, see [docs/LAUNCH.md](./docs/LAUNCH.md).

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
| LLM | Gemini Flash → Groq failover + Gemini embeddings; swappable `llm.ts` |
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

Chat tries **Gemini first**, then **Groq**, for whichever of `GEMINI_API_KEY` / `GROQ_API_KEY` are set. Failover on 429 / `RESOURCE_EXHAUSTED` / 5xx / 8s timeout / invalid JSON; 429 starts a 10-minute in-memory cooldown. Embeddings always use Gemini (`gemini-embedding-001` at 768 dims); if embed fails, judging skips similarity and continues LLM-only (no 503). Both chat providers failing → `503` “AI busy”.

Defaults: `GEMINI_MODEL=gemini-3.8-flash` (free-tier Flash), `GROQ_MODEL=openai/gpt-oss-120b` (Groq’s free/dev replacement for retired `llama-3.3-70b-versatile`) with `response_format: json_object` for judge calls.

Admin probe (requires `ADMIN_TOKEN` on the **api** Railway service — not web):

```bash
# Prefer Bearer (avoids querystring mangling of +, &, #, spaces):
curl "http://localhost:4000/health/llm" -H "Authorization: Bearer $ADMIN_TOKEN"
```

Clear the in-memory demo verdict cache after a prompt/rules deploy (same token; never commit or print it):

```bash
# After Railway api redeploys a judge prompt change (api host, POST — not the web site):
curl -X POST "https://api-production-5b5be52e.up.railway.app/admin/cache/clear" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# expect: {"ok":true,"cleared":N}

# Query alternative — URL-encode TOKEN (`+` → `%2B`); unencoded `+` becomes a space and 401s:
curl -X POST "https://api-production-5b5be52e.up.railway.app/admin/cache/clear?token=TOKEN"
```

`PROMPT_VERSION` in `apps/api/src/judge.ts` is part of the cache key — bump it whenever the system prompt, few-shots, or verdict rules change so stale verdicts are never served even before a manual clear.

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
# live quality gate (~12 labeled @demo cases; needs GEMINI_API_KEY and/or GROQ_API_KEY):
pnpm eval:judge
```

`judgeRequest` embeds the inbound message, scores cosine similarity vs the profile embedding, asks the LLM for strict JSON (zod-validated; one correction retry if score/verdict bands disagree or placeholders appear), then accepts only when `score >= min_relevance` and no deal-breaker was hit. Verdict bands: spam 0–25, reject 26–59, accept 60–100. `reason_public` is sanitized so private gate rules never leak.

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
pnpm --filter @gatekeeper/db db:seed   # demo users @demo @ada @jonas @mira (+ labeled @demo ledger)
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

**Never** set `E2E_SECRET` or `E2E_ENABLED` on Railway production. Playwright e2e is CI/preview/staging only (`E2E_ENABLED=1` + non-production `NODE_ENV`). After the internal-auth fix: invalidate all API keys and rotate `AUTH_SECRET`.

## Built by

**Built by Arsalan** · [arsalandev.studio](https://arsalandev.studio?utm_source=gatekeeper&utm_medium=readme)

**Hire me** for indie SaaS / AI product engineering: [arsalandev.studio](https://arsalandev.studio?utm_source=gatekeeper&utm_medium=readme)

## License

[AGPL-3.0](./LICENSE)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
