'use client';

import { useTransition } from 'react';

import { signOutAction } from '@/app/start/actions';
import { resetAnalytics } from '@/lib/analytics/client';

export function SignOutButton({
  className,
  label = 'Sign out',
}: {
  className?: string;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      onClick={() => {
        resetAnalytics();
        startTransition(async () => {
          await signOutAction();
        });
      }}
    >
      {label}
    </button>
  );
}
