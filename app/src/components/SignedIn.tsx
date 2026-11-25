import { Redirect } from 'expo-router';
import { ReactNode } from 'react';
import { useOdoo } from '../lib/useOdoo';

/** Pages that need a sign-in send a signed-out phone back to the sign-in screen. */
export function SignedIn({ children }: { children: ReactNode }) {
  const { status } = useOdoo();
  if (status === 'signedOut') return <Redirect href="/" />;
  return <>{children}</>;
}
