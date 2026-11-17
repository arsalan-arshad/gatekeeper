'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import {
  acceptMatch,
  declineMatch,
  dismissMatchSuggestion,
  requestMatchIntro,
  type IncomingMatch,
  type SuggestedMatch,
} from './actions';

export function MatchesClient({
  optedIn,
  suggestions,
  incoming,
}: {
  optedIn: boolean;
  suggestions: SuggestedMatch[];
  incoming: IncomingMatch[];
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [resolvedIncoming, setResolvedIncoming] = useState<Set<string>>(new Set());

  if (!optedIn) {
    return (
      <section className="rounded-md border border-white/10 bg-black/20 px-4 py-4">
        <h2 className="text-xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          People you should meet
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Join the directory to see mutual-fit suggestions.
        </p>
        <Link
          href="/dashboard/settings#directory"
          className="mt-3 inline-block text-sm text-[var(--accent)] hover:brightness-110"
        >
          List yourself in the directory →
        </Link>
      </section>
    );
  }

  const visibleSuggestions = suggestions.filter((s) => !hidden.has(s.handle));
  const visibleIncoming = incoming.filter((m) => !resolvedIncoming.has(m.matchId));

  return (
    <div className="flex flex-col gap-8">
      {visibleIncoming.length > 0 ? (
        <section>
          <h2 className="text-xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
            Intro requests for you
          </h2>
          <ul className="mt-4 flex flex-col gap-4">
            {visibleIncoming.map((item) => (
              <li key={item.matchId} className="border-b border-white/10 pb-4">
                <p className="font-medium">
                  <Link href={item.requester.profileUrl} className="hover:text-[var(--accent)]">
                    {item.requester.name}
                  </Link>
                  {item.requester.role ? (
                    <span className="text-sm text-[var(--muted)]"> · {item.requester.role}</span>
                  ) : null}
                </p>
                <p className="mt-2 text-sm text-[var(--muted)]">{item.note}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-[#062015] disabled:opacity-50"
                    onClick={() => {
                      setError(null);
                      startTransition(async () => {
                        const result = await acceptMatch(item.matchId);
                        if ('error' in result && result.error) {
                          setError(
                            result.error === 'Already decided' ? 'Already decided' : result.error,
                          );
                          return;
                        }
                        setResolvedIncoming((prev) => new Set(prev).add(item.matchId));
                        if ('introEmail' in result && result.introEmail === 'failed') {
                          setMessage(
                            "Intro accepted, but we couldn't send the email right now. Try again in a few minutes.",
                          );
                        } else {
                          setMessage('Intro accepted.');
                        }
                      });
                    }}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-md border border-white/15 px-3 py-1.5 text-sm disabled:opacity-50"
                    onClick={() => {
                      setError(null);
                      startTransition(async () => {
                        const result = await declineMatch(item.matchId);
                        if (result.error) {
                          setError(
                            result.error === 'Already decided' ? 'Already decided' : result.error,
                          );
                          return;
                        }
                        setResolvedIncoming((prev) => new Set(prev).add(item.matchId));
                        setMessage('Declined.');
                      });
                    }}
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="text-xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          People you should meet
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Mutual-fit suggestions from the directory. Requesting still goes through their rules.
        </p>
        {visibleSuggestions.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">No suggestions right now.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-5">
            {visibleSuggestions.map((item) => (
              <li key={item.handle} className="border-b border-white/10 pb-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    href={item.profileUrl}
                    className="text-lg hover:text-[var(--accent)]"
                    style={{ fontFamily: 'var(--font-display), Georgia, serif' }}
                  >
                    {item.name}
                  </Link>
                  <span className="text-xs tracking-wide text-[var(--muted)] uppercase">
                    {item.scoreBand}
                  </span>
                </div>
                {item.role ? <p className="mt-1 text-sm text-[var(--muted)]">{item.role}</p> : null}
                {item.tags.length > 0 ? (
                  <p className="mt-1 text-xs text-[var(--muted)]">{item.tags.join(' · ')}</p>
                ) : null}
                {item.bio ? <p className="mt-2 text-sm">{item.bio}</p> : null}
                {noteFor === item.handle ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <textarea
                      className="min-h-24 rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={500}
                      placeholder="Why you should meet (20–500 characters)"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-[#062015] disabled:opacity-50"
                        onClick={() => {
                          setError(null);
                          startTransition(async () => {
                            const result = await requestMatchIntro(item.handle, note);
                            if ('error' in result && result.error) {
                              setError(result.error);
                              return;
                            }
                            if ('status' in result && result.status === 'not_a_fit') {
                              setMessage(result.reason ?? 'Not a fit right now.');
                              setHidden((prev) => new Set(prev).add(item.handle));
                            } else if (
                              'status' in result &&
                              result.status === 'already_requested'
                            ) {
                              setMessage('Already requested.');
                              setHidden((prev) => new Set(prev).add(item.handle));
                            } else {
                              setMessage('Intro requested.');
                              setHidden((prev) => new Set(prev).add(item.handle));
                            }
                            setNoteFor(null);
                            setNote('');
                          });
                        }}
                      >
                        Send request
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-white/15 px-3 py-1.5 text-sm"
                        onClick={() => {
                          setNoteFor(null);
                          setNote('');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-[#062015]"
                      onClick={() => setNoteFor(item.handle)}
                    >
                      Request intro
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      className="rounded-md border border-white/15 px-3 py-1.5 text-sm disabled:opacity-50"
                      onClick={() => {
                        startTransition(async () => {
                          await dismissMatchSuggestion(item.handle);
                          setHidden((prev) => new Set(prev).add(item.handle));
                        });
                      }}
                    >
                      Not interested
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {message ? <p className="text-sm text-[var(--accent)]">{message}</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
