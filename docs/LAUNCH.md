# Gatekeeper launch checklist

Use this before pointing a public domain at production. Secrets stay in Railway / Resend — never commit them.

## 1. Railway deploy

- [ ] Create a Railway project with **Postgres** (pgvector-capable image or extension enabled).
- [ ] Deploy `apps/api` from `apps/api/railway.toml` (build db + api, health `/health`).
- [ ] Deploy `apps/web` from `apps/web/railway.toml` (Next.js, health `/`).
- [ ] Set shared env from `.env.example`: `DATABASE_URL`, `AUTH_SECRET`, `API_URL`, `APP_URL`, `GEMINI_API_KEY` (or Groq), optional `RESEND_API_KEY`, `INTERNAL_API_SECRET`.
- [ ] Run migrations once against production: `pnpm --filter @gatekeeper/db db:migrate`.
- [ ] Optional demo data: `pnpm --filter @gatekeeper/db db:seed` (creates `@ada`, `@jonas`, `@mira`).
- [ ] Confirm `GET /health` on the API service and `/` on the web service.

## 2. Custom domain

- [ ] Attach your domain to the **web** Railway service (e.g. `gatekeeper.example.com`).
- [ ] Optionally attach `api.` subdomain to the API service, or proxy `/v1` via the web app if you prefer one host.
- [ ] Update `APP_URL` and `API_URL` to the public HTTPS origins.
- [ ] Re-check Auth.js magic-link redirect URLs match `APP_URL`.

## 3. Resend domain verification

- [ ] Add your sending domain in [Resend](https://resend.com) and publish the DNS records (SPF, DKIM, optional DMARC).
- [ ] Wait until Resend marks the domain **Verified**.
- [ ] Set `RESEND_API_KEY` and `EMAIL_FROM` (e.g. `Gatekeeper <noreply@yourdomain.com>`) on both web (magic links) and API (opt-in intros).
- [ ] Send a test magic link and a test Accept/Decline intro email.

## 4. Demo GIF for the README

- [ ] Record a ~15–30s loop: landing → Start → (optional) public profile request → ledger.
- [ ] Prefer a quiet desktop capture (no secrets in the frame).
- [ ] Export as `docs/media/demo.gif` (or MP4 + convert).
- [ ] If you cannot record yet, run the placeholder script:

```bash
./scripts/generate-demo-gif-placeholder.sh
```

- [ ] Link the GIF from the README once the file exists:

```markdown
![Gatekeeper demo](./docs/media/demo.gif)
```

## 5. Smoke after go-live

- [ ] Landing headline reads: **Your AI front door that says no for you**.
- [ ] `/privacy` loads.
- [ ] Oversized POST (>64 KiB) returns **413** and writes an `abuse_events` row.
- [ ] Bursting `/v1/requests` returns **429** and logs `rate_limit_*`.
- [ ] Payments remain off unless `PAYMENTS_ENABLED=true` and Lemon is configured.

## Seed command (copy/paste)

```bash
export DATABASE_URL=postgresql://…   # local or Railway
pnpm --filter @gatekeeper/db db:migrate
pnpm --filter @gatekeeper/db db:seed
```

Demo handles: `@ada`, `@jonas`, `@mira` (emails `*@demo.gatekeeper.local`).
