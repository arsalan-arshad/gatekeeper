import { NotFoundView } from '@/components/not-found-view';
import { handleNotFoundMetadata } from '@/lib/handle-not-found-meta';

/**
 * Soft 404 document for unknown `/@handle` (and `/@handle/ledger`).
 *
 * Rendered at status 200 so Next does **not** inject its automatic
 * `content="noindex"` tag (that injection runs for status > 400 / `/404` /
 * `notFound()`). Middleware then re-serves this HTML as HTTP 404 with
 * `X-Robots-Tag: noindex, nofollow`, preserving exactly one robots meta:
 * `noindex, nofollow`. No homepage canonical.
 */
export const metadata = handleNotFoundMetadata;

export default function HandleNotFoundPage() {
  return <NotFoundView />;
}
