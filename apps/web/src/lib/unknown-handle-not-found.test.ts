import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handleNotFoundMetadata } from './handle-not-found-meta.ts';
import { NOINDEX_NOFOLLOW } from './robots-header.ts';
import {
  HANDLE_NOT_FOUND_PATH,
  INTERNAL_HANDLE_NOT_FOUND_HEADER,
  buildUnknownHandleNotFoundResponse,
  hasExactNoindexNofollowRobotsMeta,
  robotsMetaContents,
} from './unknown-handle-not-found.ts';

test('handle-not-found page metadata is exactly noindex, nofollow (no canonical)', () => {
  assert.deepEqual(handleNotFoundMetadata.robots, { index: false, follow: false });
  assert.equal(handleNotFoundMetadata.title, 'Not found · Gatekeeper');
  assert.equal(
    (handleNotFoundMetadata as { alternates?: { canonical?: string } }).alternates?.canonical,
    undefined,
  );
});

test('robotsMetaContents / hasExactNoindexNofollowRobotsMeta enforce a single meta', () => {
  const good = `<html><head><meta name="robots" content="noindex, nofollow"/><title>x</title></head></html>`;
  assert.deepEqual(robotsMetaContents(good), [NOINDEX_NOFOLLOW]);
  assert.equal(hasExactNoindexNofollowRobotsMeta(good), true);

  const dup = `<html><head><meta name="robots" content="noindex"/><meta name="robots" content="noindex, nofollow"/></head></html>`;
  assert.equal(hasExactNoindexNofollowRobotsMeta(dup), false);
  assert.equal(robotsMetaContents(dup).length, 2);

  const onlyNoindex = `<html><head><meta name="robots" content="noindex"/></head></html>`;
  assert.equal(hasExactNoindexNofollowRobotsMeta(onlyNoindex), false);
});

test('unknown handle hard 404: status 404, X-Robots-Tag, exactly one noindex,nofollow meta', async () => {
  const softHtml = `<!DOCTYPE html><html><head><meta name="robots" content="noindex, nofollow"/><title>Not found · Gatekeeper</title></head><body><h1>This door doesn't exist</h1></body></html>`;

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    assert.match(url, new RegExp(`${HANDLE_NOT_FOUND_PATH}$`));
    const headers = new Headers(init?.headers);
    assert.equal(headers.get(INTERNAL_HANDLE_NOT_FOUND_HEADER), '1');
    return new Response(softHtml, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  };

  const response = await buildUnknownHandleNotFoundResponse({
    origin: 'http://localhost:3000',
    fetchImpl,
  });

  assert.equal(response.status, 404);
  assert.equal(response.headers.get('X-Robots-Tag'), NOINDEX_NOFOLLOW);
  const html = await response.text();
  assert.equal(hasExactNoindexNofollowRobotsMeta(html), true);
  assert.doesNotMatch(html, /rel=["']canonical["']/i);
  assert.doesNotMatch(html, /gatekeeper\.arsalandev\.studio\/["'\s]/i);
});

test('unknown handle hard 404 falls back to minimal HTML with exact robots meta', async () => {
  const fetchImpl: typeof fetch = async () => {
    throw new Error('upstream down');
  };
  const response = await buildUnknownHandleNotFoundResponse({
    origin: 'http://localhost:3000',
    fetchImpl,
  });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('X-Robots-Tag'), NOINDEX_NOFOLLOW);
  const html = await response.text();
  assert.equal(hasExactNoindexNofollowRobotsMeta(html), true);
});
