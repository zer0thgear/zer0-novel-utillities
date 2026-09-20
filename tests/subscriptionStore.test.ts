import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/sessionStore';
import { useSubscriptionStore } from '@/store/subscriptionStore';

// The session's Anlas tally is counted from the balance NovelAI reports, not
// from our own estimates, so it's what was actually charged.

const subscription = (anlas: number) => ({
  tier: 3,
  active: true,
  trainingStepsLeft: { fixedTrainingStepsLeft: anlas, purchasedTrainingSteps: 0 },
  usage: { percent: 90, isNegative: false, timeUntilNextPercent: 7900 },
});

function serve(balances: number[]) {
  globalThis.fetch = vi.fn(async () => {
    const next = balances.shift() ?? 0;
    return new Response(JSON.stringify(subscription(next)), { status: 200 });
  }) as unknown as typeof fetch;
}

const refresh = () => useSubscriptionStore.getState().refresh();
const spent = () => useSubscriptionStore.getState().spentThisSession;

beforeEach(() => {
  useSessionStore.setState({ apiKey: 'key-one' });
  useSubscriptionStore.setState({
    subscription: null,
    forKey: null,
    attemptedFor: null,
    lastAnlas: null,
    spentThisSession: 0,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the session Anlas tally', () => {
  it('starts at zero and stays there while nothing is spent', async () => {
    serve([8000, 8000]);
    await refresh();
    expect(spent()).toBe(0);
    await refresh();
    expect(spent()).toBe(0);
  });

  it('adds up what the balance drops by', async () => {
    serve([8000, 7974, 7896]);
    await refresh();
    await refresh();
    expect(spent()).toBe(26);
    await refresh();
    expect(spent()).toBe(104);
  });

  it('treats a top-up as a new baseline, not a refund', async () => {
    serve([8000, 7900, 12900, 12800]);
    await refresh();
    await refresh();
    expect(spent()).toBe(100);
    await refresh(); // bought 5,000
    expect(spent()).toBe(100);
    await refresh();
    expect(spent()).toBe(200);
  });

  it('starts over for a different API key', async () => {
    serve([8000, 7900]);
    await refresh();
    await refresh();
    expect(spent()).toBe(100);

    useSessionStore.setState({ apiKey: 'key-two' });
    serve([500, 400]);
    await refresh();
    expect(spent()).toBe(0);
    await refresh();
    expect(spent()).toBe(100);
  });

  it('leaves the tally alone when a refresh fails', async () => {
    serve([8000, 7900]);
    await refresh();
    await refresh();
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    await refresh();
    expect(spent()).toBe(100);
    expect(useSubscriptionStore.getState().error).toBeTruthy();
  });
});
