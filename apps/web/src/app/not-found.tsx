import type { Metadata } from 'next';

import { NotFoundView } from '@/components/not-found-view';

/**
 * Generic App Router not-found (unmatched routes / notFound()).
 *
 * Do not set `robots` here: Next.js already injects
 * `<meta name="robots" content="noindex"/>` when `notFound()` runs or status
 * is 404. Adding robots metadata would duplicate the tag.
 *
 * Unknown public handles are handled separately via `/handle-not-found`
 * (middleware hard 404) so they can emit exactly one
 * `noindex, nofollow` meta without Next's automatic `noindex`-only tag.
 *
 * Homepage canonical/OG are intentionally not in the root layout, so this
 * page does not inherit them.
 */
export const metadata: Metadata = {
  title: 'Not found · Gatekeeper',
};

export default function NotFound() {
  return <NotFoundView />;
}
