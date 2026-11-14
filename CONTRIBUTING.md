# Contributing to Gatekeeper

Thanks for helping build an open-source AI principal. Keep changes small, documented, and privacy-first.

## Ground rules

- **Never commit secrets.** Use `.env.example` only; real keys stay local / in deploy env.
- **Privacy first.** Never reveal a receiver's private gate rules in API responses, emails, or logs.
- **LLM discipline.** Rate-limit and cache LLM / embedding calls; prefer free tiers.
- **Tests for core logic.** Add or update tests when you touch judging, LLM adapters, or auth.
- **Keep it simple.** Prefer clear TypeScript over clever abstractions so new contributors can follow along.

## Setup

1. Fork and clone the repo.
2. Install with `pnpm install` (Node ≥ 20, pnpm 9).
3. Copy `.env.example` → `.env` and fill what you need for local work.
4. Run `pnpm lint` and `pnpm test` before opening a PR.

## Workspace map

| Path | Role |
| --- | --- |
| `apps/api` | Fastify API |
| `apps/web` | Next.js + Tailwind UI |
| `packages/db` | Drizzle + Postgres / pgvector |

## Pull requests

1. Create a branch from `main`.
2. Keep PRs focused (one concern when practical).
3. Ensure `pnpm lint` and `pnpm test` pass.
4. Describe *what* changed and *why*; link issues when relevant.

## License

By contributing, you agree your contributions are licensed under the **AGPL-3.0** license in this repository.
