'use client';

import { useEffect, useState } from 'react';
import { useSessionStore } from '@/store/sessionStore';

export function ApiKeyModal() {
  const { apiKey, setApiKey, hydrateApiKey } = useSessionStore();
  const [input, setInput] = useState('');

  // Load a previously-saved key after mount — see hydrateApiKey for why this
  // can't happen in the store's initial state.
  useEffect(() => {
    hydrateApiKey();
  }, [hydrateApiKey]);

  // Don't render once a key is present
  if (apiKey) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    setApiKey(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl bg-slate-800 p-8 shadow-2xl border border-slate-700">
        <h2 className="mb-2 text-xl font-semibold text-slate-100">
          Enter your NovelAI API Key
        </h2>
        <p className="mb-6 text-sm text-slate-400 leading-relaxed">
          Your key is saved in this browser (it stays after you close it, until you use
          &ldquo;Change key&rdquo;) and is only ever sent directly to NovelAI&apos;s servers.
          Don&apos;t enter it on a shared or public machine.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="pst-..."
            autoFocus
            className="w-full rounded-lg bg-slate-700 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none border border-slate-600 focus:border-violet-500 transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="w-full rounded-lg bg-violet-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </form>
        <p className="mt-4 text-xs text-slate-600">
          You can find your API key in the NovelAI account settings.
        </p>
      </div>
    </div>
  );
}
