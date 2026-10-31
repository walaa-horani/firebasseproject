'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from './AuthProvider';

/**
 * Redirects signed-out visitors to the sign-in page. Children always render
 * (they show their own loading state until a user exists), so Next.js can
 * prerender the route segments and validate instant navigation.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/');
  }, [loading, user, router]);

  return children;
}
