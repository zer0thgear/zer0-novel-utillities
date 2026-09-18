'use client';

import { useEffect, useState } from 'react';
import { TransferModal } from './TransferModal';

/** Sidebar entry point for exporting to / importing from a JSON file. */
export function TransferSection() {
  const [mode, setMode] = useState<'export' | 'import' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(t);
  }, [message]);

  const btn =
    'rounded bg-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-200 transition-colors hover:bg-violet-600';

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-slate-700/40 bg-slate-800/40 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Import / Export</span>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setMode('export')} className={btn}>
            Export…
          </button>
          <button type="button" onClick={() => setMode('import')} className={btn}>
            Import…
          </button>
        </div>
      </div>
      {message && <p className="text-xs text-emerald-400">{message}</p>}
      {mode && <TransferModal mode={mode} onClose={() => setMode(null)} onImported={setMessage} />}
    </div>
  );
}
