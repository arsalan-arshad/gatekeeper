/** Reject path-traversal / non-UUID ids before interpolating into API URLs. */
const ACTION_ID_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateActionId(
  id: string,
): { ok: true; id: string } | { ok: false; error: 'Invalid id' } {
  if (typeof id !== 'string' || !ACTION_ID_UUID.test(id)) {
    return { ok: false, error: 'Invalid id' };
  }
  return { ok: true, id };
}
