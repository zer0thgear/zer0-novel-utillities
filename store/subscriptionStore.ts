import { create } from 'zustand';
import { NovelAISubscription } from '@/types/novelai';
import { useSessionStore } from '@/store/sessionStore';

// One shared copy of GET /user/subscription (Anlas balance, Opus allowance,
// tier), instead of each component fetching and holding its own.

interface SubscriptionState {
  subscription: NovelAISubscription | null;
  /** The API key `subscription` belongs to, so a changed key never shows
   *  the previous account's numbers. */
  forKey: string | null;
  /** The key the last fetch was started for — set synchronously, so the first
   *  of several components mounting together is the only one that fetches,
   *  and a failing key isn't retried in a loop. */
  attemptedFor: string | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;

  /** The balance at the last refresh, and how much of it this session has
   *  spent. Counted from the balance itself rather than from our own
   *  estimates, so it's what NovelAI actually charged. A top-up moves the
   *  baseline up without counting as a refund. */
  lastAnlas: number | null;
  spentThisSession: number;
}

const totalAnlas = (s: NovelAISubscription) =>
  s.trainingStepsLeft.fixedTrainingStepsLeft + s.trainingStepsLeft.purchasedTrainingSteps;

let latestRequest = 0;

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  subscription: null,
  forKey: null,
  attemptedFor: null,
  isLoading: false,
  error: null,
  lastAnlas: null,
  spentThisSession: 0,
  refresh: async () => {
    const apiKey = useSessionStore.getState().apiKey;
    if (!apiKey) return;
    const request = ++latestRequest;
    // Keep showing the current numbers while refreshing, so the balance
    // doesn't blink out after every generation.
    set({ isLoading: true, error: null, attemptedFor: apiKey });
    try {
      const res = await fetch('https://image.novelai.net/user/subscription', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`Failed to load subscription info (${res.status}).`);
      const data = (await res.json()) as NovelAISubscription;
      if (request === latestRequest) {
        set((state) => {
          const total = totalAnlas(data);
          // A new key starts its own tally.
          const carryOver = state.forKey === apiKey;
          const before = carryOver ? state.lastAnlas : null;
          return {
            subscription: data,
            forKey: apiKey,
            lastAnlas: total,
            spentThisSession:
              before !== null && total < before
                ? state.spentThisSession + (before - total)
                : carryOver
                  ? state.spentThisSession
                  : 0,
          };
        });
      }
    } catch (err) {
      if (request === latestRequest) set({ error: err instanceof Error ? err.message : 'An unknown error occurred.' });
    } finally {
      if (request === latestRequest) set({ isLoading: false });
    }
  },
}));

// Every Anlas-spending action (generate, Director Tools, upscale, …) ends by
// adding images to the session, so new images are the one signal that covers
// all of them. Debounced so a batch or a run of queued images refreshes once
// it settles rather than once per image.
const REFRESH_DELAY_MS = 1000;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;

if (typeof window !== 'undefined') {
  useSessionStore.subscribe((state, prev) => {
    if (state.images.length <= prev.images.length) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => useSubscriptionStore.getState().refresh(), REFRESH_DELAY_MS);
  });
}
