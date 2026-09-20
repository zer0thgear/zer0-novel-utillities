import { useEffect } from 'react';
import { useSessionStore } from '@/store/sessionStore';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { NovelAISubscription } from '@/types/novelai';

interface UseSubscriptionReturn {
  subscription: NovelAISubscription | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  /** Anlas this session has actually been charged, from the balance itself. */
  spentThisSession: number;
}

// Feeds the Anlas balance and the "Opus Generation Usage Limit" meter NovelAI's
// own site shows. GET /user/subscription needs only the persistent API key.
// State is shared (store/subscriptionStore.ts), and refreshes itself after
// anything that spends Anlas.
export function useSubscription(): UseSubscriptionReturn {
  const apiKey = useSessionStore((s) => s.apiKey);
  const { subscription, forKey, isLoading, error, refresh, spentThisSession } = useSubscriptionStore();

  // First use under a new key fetches once; other components mounting
  // alongside it read the live store (not this render's copy) and skip.
  useEffect(() => {
    if (apiKey && useSubscriptionStore.getState().attemptedFor !== apiKey) refresh();
  }, [apiKey, refresh]);

  return {
    subscription: apiKey && forKey === apiKey ? subscription : null,
    isLoading,
    error,
    refresh,
    spentThisSession,
  };
}
