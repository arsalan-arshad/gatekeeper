# Gatekeeper — add PostHog analytics and close SEO gaps

Work in the Gatekeeper monorepo (pnpm, Next.js App Router web app, Fastify API). The live production site is https://gatekeeper.arsalandev.studio/. Implement everything below in one coherent change set. Do not weaken existing security hardening (CSP, security headers, auth, rate limits, e2e-login-disabled-in-prod). Do not send email. Do not invent review ratings or fake schema.

Audit baseline (16 Nov 2026, commit `3454cbb` / #42): `/workspace/seo/audit-2026-11-16.md` if present; otherwise treat the requirements in this prompt as the source of truth.

## 1) PostHog analytics (required)

Use **PostHog only** (free cloud tier). Do not add Google Analytics or any other product analytics SDK.

### Install and init

- Add `posthog-js` to `@gatekeeper/web`. If you also emit optional server-side events from the API, add `posthog-node` to `@gatekeeper/api` only for that path.
- Env (web):
  - `NEXT_PUBLIC_POSTHOG_KEY` — project key
  - `NEXT_PUBLIC_POSTHOG_HOST` — must be the same-origin reverse proxy path, e.g. `/ingest` (not the raw PostHog cloud host in the browser)
- Env (web, build-time, for rewrites):
  - `POSTHOG_PROXY_INGEST_ORIGIN` — `https://us.i.posthog.com` or `https://eu.i.posthog.com`
  - `POSTHOG_PROXY_ASSET_ORIGIN` — `https://us-assets.i.posthog.com` or `https://eu-assets.i.posthog.com`
- If the key is missing or empty, analytics must be a complete **no-op**: no network calls, no errors, no UI change. Local dev and production without keys stay silent.
- Respect **DNT**. If `navigator.doNotTrack === '1'` (or the equivalent), do not init capturing or immediately opt out, including session replay.
- Load PostHog only on the Next.js web app, never on API-rendered HTML (opt-in / sender-verify pages).

### Reverse proxy (adblockers)

In `apps/web/next.config.ts` `rewrites()`, add (exact pattern, destinations from the proxy origin env vars, defaulting to US cloud if unset):

- `/ingest/static/:path*` → `${POSTHOG_PROXY_ASSET_ORIGIN}/static/:path*`
- `/ingest/:path*` → `${POSTHOG_PROXY_INGEST_ORIGIN}/:path*`

Keep existing rewrites (`/@:handle`, `/@:handle/ledger`, `/openapi.json`, `/llms.txt`). Init `posthog-js` with `api_host` = `NEXT_PUBLIC_POSTHOG_HOST` (`/ingest`) and `ui_host` = the human PostHog UI origin (`https://us.posthog.com` or `https://eu.posthog.com`, derived from the same region). Do not point the browser at `*.i.posthog.com` directly.

### CSP

Update the web CSP in `apps/web/next.config.ts`. Goals:

- Allow PostHog **only** through the same-origin `/ingest` proxy where possible (`script-src`/`connect-src` stay `'self'` for PostHog).
- If a specific PostHog host is still required, allow **only** the configured ingest/asset/UI origins — no new wildcards (`https:`, `http:`, `*`).
- Session replay needs `worker-src 'self' blob:` (add this directive if missing).
- Do **not** remove existing hardening: keep `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`.
- Do not broaden `script-src` beyond what is already there unless a nonce/hash approach is implemented (out of scope to rip out `'unsafe-inline'`/`'unsafe-eval'` in this change, but do not add new third-party script hosts).
- API Helmet CSP in `apps/api/src/index.ts` stays tight. Do not load PostHog there.

### Privacy: no PII, ever

- **Never** send email addresses, names used as contact identity, message bodies, intro text, interview answer text, API keys, tokens, or magic-link URLs in event properties, person properties, or session replay.
- `posthog.identify()` **only** with the internal Gatekeeper `users.id` (UUID). Never identify by email, never set `email` as a person property, never pass `session.user.email` into PostHog. On sign-out, `posthog.reset()`.
- Funnel event properties may include non-PII flags only (e.g. verdict **band** `spam` | `reject` | `accept`, boolean success, plan name). Scores, reasons, and raw messages are forbidden.
- Add a sanitizer used by every `capture` path that drops keys such as `email`, `senderContact`, `message`, `body`, `token`, `authorization`. Unit-test it.

### Session replay (required)

Enable PostHog session replay when the key is present and DNT is not set:

- `maskAllInputs: true` globally (every input, including email, message, and dashboard fields).
- Mask **all text** on dashboard / inbox surfaces so request content and emails cannot appear in recordings. Implement this by wrapping `apps/web/src/app/dashboard/**` (inbox, rules, keys, billing, settings, dashboard ledger) in a persistent `data-ph-mask` (or equivalent) and setting `session_recording.maskTextSelector` so that tree is fully masked. Alternatively set `maskAllText` when the path starts with `/dashboard`.
- Also mask any public-form message textarea content (already covered by `maskAllInputs`). Do not record the check-email page contents as identifiable data.
- Replay must be off when analytics is a no-op or when DNT is set.

### Pageviews and funnel events

Capture `$pageview` on first load and on App Router client navigations (pathname + search, no PII in the URL if you add query filters — never include email query params in the captured path; strip them).

Client (or server where noted) events, exact names:

| Event | When | Properties allowed |
| --- | --- | --- |
| `demo_started` | User starts the landing and/or `/@demo` demo flow | `surface`: `landing` \| `demo_profile` |
| `demo_submitted` | Demo judgment returns | `band`: `spam` \| `reject` \| `accept` only (no score, no reason, no message) |
| `signup_started` | User submits the magic-link form on `/start` | none |
| `magic_link_sent` | Magic-link request succeeds | none |
| `signup_completed` | First authenticated session after a new account (or first onboarding landing) | none |
| `interview_completed` | Onboarding interview finished | none |
| `rules_drafted` | “Draft my rules” succeeds | none |
| `handle_link_copied` | User copies their public `/@handle` link | none |
| `request_received` | Optional, **server-side** on the API when a real request is accepted for judging | `band` only if already judged; **no** handle required; never email or message |
| `owner_approved` | Owner approves an intro | none |
| `owner_rejected` | Owner rejects/declines an intro | none |
| `api_key_created` | A new API key is created | none |
| `upgrade_clicked` | User clicks the upgrade / Pro CTA | `surface` optional |

Wire these at the real call sites (hero demo, `@demo` form, start actions, interview client, rules client, settings/share, dashboard approve/decline, keys client, billing CTA). If a server action is the only success path, capture there or immediately after success on the client — once, not twice.

Optional API `request_received`: no-op without `POSTHOG_KEY` / `POSTHOG_HOST` on the API service. Use the same no-PII rules.

### Privacy page

Add a short, accurate paragraph to `/privacy` (`apps/web/src/app/privacy/page.tsx`): product analytics via PostHog; pageviews and funnel events; session replay with inputs and dashboard/inbox text masked; Do Not Track honored; no email addresses or message contents sent; users identified only by an internal id. Do not claim you collect nothing if PostHog is on.

## 2) SEO fixes (required)

Close every gap below. Use `BRAND.siteUrl` / `metadataBase` so production HTML never emits localhost. All public OG/Twitter images stay `https://gatekeeper.arsalandev.studio/og.png` (or the same path resolved through `metadataBase`).

### Global

- Add `alternates.canonical` on every **indexable** page, absolute, matching the public URL (no trailing slash except `/`).
- Root layout OG/Twitter remain the homepage defaults. **Page-level** `metadata` must override `title`, `description`, `openGraph.url`, `openGraph.title`, `openGraph.description`, and `twitter` title/description so they are not the homepage’s.
- Keep JSON-LD valid. On the **homepage only**, emit a `@graph` with `SoftwareApplication` and `Organization` (name Gatekeeper, url = siteUrl, creator Person / same organization url `https://arsalandev.studio`). Do not repeat that graph on 404s, dashboard, auth, or profile pages. Optional: `offers` for a free hosted plan / AGPL open-source — no aggregateRating unless you have real reviews.
- Public profile pages: keep unique `generateMetadata`. Add `alternates.canonical` = `${siteUrl}/@${handle}`. Add page-level JSON-LD `ProfilePage` + `Person` (name, url of the public handle). Continue `fetch(..., { cache: 'no-store' })` so metadata stays unique and server-rendered.
- User ledger pages (`/@handle/ledger`): add `generateMetadata` (title like `@handle public ledger · Gatekeeper`, unique description, canonical `${siteUrl}/@${handle}/ledger`).
- Fix duplicate URLs: **308 (or 301) redirect** `/u/:handle` → `/@:handle` and `/u/:handle/ledger` → `/@:handle/ledger`. Keep the existing rewrite `/@:handle` → `/u/:handle` for the internal route. Do not create a redirect loop. After this, `/u/...` must not return 200.
- 308 `/demo` → `/@demo`.
- `robots.ts`: keep `Allow: /`. Disallow `/dashboard`, `/dashboard/`, `/e2e`, `/e2e/`, `/api/`, `/start/check-email`, `/u/`. Keep sitemap URL absolute on `BRAND.siteUrl`.
- `sitemap.ts`: keep `/`, `/start`, `/ledger`, `/@demo`, `/privacy`, `/terms`. Add `/@demo/ledger`. Do **not** include dashboard, `/start/check-email`, `/api/*`, `/u/*`, or auth URLs. Optionally include other **public** handles if you can list them without leaking private data (public profiles only). Do not add `/llms.txt` unless you have a reason; linking it from the footer is enough.
- Add a web manifest (`app/manifest.ts` or equivalent): name Gatekeeper, short name, `start_url: '/'`, icons using existing `/icon-512.png` / `/apple-touch-icon.png` / `/icon.svg` as appropriate, theme color consistent with the dark brand. `/manifest.json` must not 404.
- Creator avatar on the landing: `alt="Arsalan"` (or `BRAND.creator.name`), not `alt=""`.
- Long-cache static brand assets (`og.png`, favicons, apple-touch-icon, icon-512) via `next.config.ts` headers (`Cache-Control: public, max-age=86400` or better, without breaking HTML document caching).
- Collapse 404 robots tags to a single `noindex, nofollow`. Keep the custom 404 title and `<h1>`.
- `/start/check-email`, dashboard (already), e2e, Auth.js error page: `noindex, nofollow`. Prefer a small `apps/web` route/layout metadata for auth pages if Auth.js allows it; at minimum add `X-Robots-Tag: noindex, nofollow` for `/api/auth/*` and `/start/check-email`.
- API HTML pages (`apps/api/src/routes/opt-in.ts` `htmlPage`, `apps/api/src/routes/sender-verify.ts` success HTML): add `<meta name="robots" content="noindex, nofollow">` and send `X-Robots-Tag: noindex, nofollow`. Missing-token JSON may also include that header.

### Per-page metadata (acceptance)

| Route | index | Title (approx.) | Description | Canonical |
| --- | --- | --- | --- | --- |
| `/` | yes | Keep the value-prop title; prefer ≤60 characters if you can without dropping the tagline meaning. OG title may match. | Keep current summary | `${siteUrl}/` |
| `/start` | yes | `Set up your front door · Gatekeeper` (or equivalent unique) | Unique: magic-link signup / interview for a public Gatekeeper handle | `${siteUrl}/start` |
| `/start/check-email` | **no** | `Check your email · Gatekeeper` | Short, noindex | `${siteUrl}/start/check-email` (or omit canonical) |
| `/ledger` | yes | `Public ledger · Gatekeeper` | Unique: public accept rates / spam blocked / trust ledger | `${siteUrl}/ledger` |
| `/privacy` | yes | `Privacy — Gatekeeper` (already) | Keep/extend; OG must match this page, not the homepage | `${siteUrl}/privacy` |
| `/terms` | yes | `Terms of use · Gatekeeper` | Unique terms description; add the missing `metadata` export | `${siteUrl}/terms` |
| `/@handle` | yes | `{Name} (@handle) · Gatekeeper` (already) | Bio or the existing fallback | `${siteUrl}/@handle` |
| `/@handle/ledger` | yes | `@{handle} public ledger · Gatekeeper` | Unique | `${siteUrl}/@handle/ledger` |
| `/dashboard/**` | **no** | any | noindex, nofollow (already on layout — keep) | none required |
| 404 | **no** | `Not found · Gatekeeper` | noindex, nofollow | none |

`llms.txt` remains a plain-text rewrite. No HTML metadata required.

## 3) Tests, security, quality bar

- `pnpm --filter @gatekeeper/api test` and `pnpm --filter @gatekeeper/web test` must stay green. Do not drop existing coverage. (Web unit suite is 27 tests at `3454cbb`; API must not regress.)
- `pnpm typecheck` and `pnpm lint` must pass. Playwright e2e must still pass.
- Add unit tests where they are cheap and valuable:
  - Analytics helper is a no-op without a key.
  - Sanitizer strips email / message / token fields.
  - `robots.ts` / `sitemap.ts` contents: public URLs included, private/auth/`/u/` excluded; sitemap does not list `/dashboard`.
  - Brand/metadata helpers if you add them (canonical uses `BRAND.siteUrl`, never localhost).
- Do not change judge bands, auth JWT behaviour, CORS allowlist, or rate limits.
- `PROMPT_VERSION` / `pnpm eval:judge` are out of scope unless you touch judge code (you should not).

## 4) Railway env vars to set (document in `.env.example` too)

Set on the **web** service, then redeploy web (rewrites are build-time):

```
NEXT_PUBLIC_POSTHOG_KEY=<project API key>
NEXT_PUBLIC_POSTHOG_HOST=/ingest
POSTHOG_PROXY_INGEST_ORIGIN=https://us.i.posthog.com
POSTHOG_PROXY_ASSET_ORIGIN=https://us-assets.i.posthog.com
```

If the PostHog project is on **EU** cloud, use `https://eu.i.posthog.com` and `https://eu-assets.i.posthog.com` instead (and `ui_host` `https://eu.posthog.com`).

Optional, **API** service, only if `request_received` is implemented server-side:

```
POSTHOG_KEY=<same project API key>
POSTHOG_HOST=https://us.i.posthog.com
```

(Use the EU ingest origin if the project is EU.) Do **not** prefix the API key as `NEXT_PUBLIC_*` on the API service. Do not put PostHog keys in the repo.

Leave `NEXT_PUBLIC_SITE_URL=https://gatekeeper.arsalandev.studio` set on web if it is not already (required for metadataBase / sitemap).

Until `NEXT_PUBLIC_POSTHOG_KEY` is set, the app must boot and behave as today.

## 5) Acceptance checklist

- [ ] No PostHog requests when the key is unset; no exceptions in dev.
- [ ] With key set: pageviews fire on `/` and on client navigations; `/ingest` is used, not a blocked third-party host.
- [ ] DNT disables capture + replay.
- [ ] Session replay on: inputs masked globally; dashboard/inbox text masked; no email or message text in recordings or events.
- [ ] `identify` uses `users.id` only; email never appears in PostHog payloads (unit test + code review).
- [ ] All listed funnel events exist at the correct success points; `demo_submitted` sends `band` only.
- [ ] Privacy page documents the above.
- [ ] CSP/headers still present; PostHog allowed only via the proxy (or the exact configured hosts); no new CSP wildcards.
- [ ] Every indexable page has a unique title, unique description, matching OG/Twitter, absolute canonical, and absolute prod `og:image`.
- [ ] `/u/:handle` and `/u/:handle/ledger` redirect to `/@…`; `/demo` redirects to `/@demo`.
- [ ] `robots.txt` and `sitemap.xml` match section 2. Dashboard/auth/check-email/`/u/` stay out of the sitemap and are disallowed or noindexed.
- [ ] API opt-in and sender-verify HTML is `noindex, nofollow`.
- [ ] `/manifest.json` returns a manifest, not a 404.
- [ ] Landing creator image has a real alt. 404 keeps a single noindex tag and an `<h1>`.
- [ ] Profiles remain SSR with unique metadata.
- [ ] All existing tests pass; new tests above are included.
