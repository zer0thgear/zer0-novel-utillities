import { useCallback, useEffect, useState } from 'react';
import { useSessionStore } from '@/store/sessionStore';
import { NovelAISubscription } from '@/types/novelai';

interface UseSubscriptionReturn {
  subscription: NovelAISubscription | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

// Feeds the "Opus Generation Usage Limit" meter NovelAI's own site shows.
// GET /user/subscription needs only the persistent API key — no extra params.
export function useSubscription(): UseSubscriptionReturn {
  const apiKey = useSessionStore((s) => s.apiKey);
  const [subscription, setSubscription] = useState<NovelAISubscription | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  const refresh = useCallback(() => setRefreshCount((c) => c + 1), []);

  useEffect(() => {
    if (!apiKey) return; // nothing to fetch; the return value below masks stale data anyway

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetch('https://image.novelai.net/user/subscription', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load subscription info (${res.status}).`);
        return res.json() as Promise<NovelAISubscription>;
      })
      .then((data) => {
        if (!cancelled) setSubscription(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [apiKey, refreshCount]);

  return { subscription: apiKey ? subscription : null, isLoading, error, refresh };
}
