/** Normalize a public Gatekeeper handle. */
export function normalizeHandle(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}
