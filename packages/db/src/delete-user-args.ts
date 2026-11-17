export const DELETE_USER_USAGE =
  'Usage: pnpm --filter @gatekeeper/db db:delete-user -- <handle> [--yes]\n' +
  '  Omit --yes for dry-run.\n' +
  '  DATABASE_URL must be set in the environment (not loaded from .env automatically).\n' +
  '  Example: DATABASE_URL="$DATABASE_URL" pnpm --filter @gatekeeper/db db:delete-user -- my-handle';

export function parseArgs(argv: string[]): { handle: string; yes: boolean; help: boolean } {
  const tokens = argv.filter((a) => a !== '--');
  if (tokens.includes('--help') || tokens.includes('-h')) {
    return { handle: '', yes: false, help: true };
  }
  const positional = tokens.filter((a) => !a.startsWith('-'));
  const handle = positional[0]?.trim().toLowerCase() ?? '';
  return { handle, yes: tokens.includes('--yes'), help: false };
}
