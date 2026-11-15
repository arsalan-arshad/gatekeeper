/** Public API base URL — safe for client components (no secrets / Node crypto). */
export const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
