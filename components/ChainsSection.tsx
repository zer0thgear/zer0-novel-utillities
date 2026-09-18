'use client';

import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { chainSummary } from '@/lib/chains';
import { Chain } from '@/types/novelai';
import { ChainEditorModal } from './ChainEditorModal';

/** Sidebar list of saved chains, plus the "after each Generate" setting. */
export function ChainsSection() {
  const form = useSettingsStore();
  const chains = form.chains;
  const [open, setOpen] = useState(false);
  // `undefined`: editor closed; `null`: a new chain.
  const [editing, setEditing] = useState<Chain | null | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // An armed delete quietly disarms, so a stray later click can't trigger it.
  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(null), 3000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  const autoChain = chains.find((c) => c.id === form.autoChainId);

  function remove(chain: Chain) {
    if (confirmDelete !== chain.id) {
      setConfirmDelete(chain.id);
      return;
    }
    form.set('chains', chains.filter((c) => c.id !== chain.id));
    if (form.autoChainId === chain.id) form.set('autoChainId', null);
    setConfirmDelete(null);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-700/40 bg-slate-800/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <span className="flex-shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Chains
          {chains.length > 0 && <span className="ml-1.5 normal-case font-normal text-violet-400">({chains.length})</span>}
          {autoChain && (
            <span className="ml-1.5 normal-case font-normal text-emerald-400" title="Runs after each generation">
              · auto: {autoChain.name}
            </span>
          )}
        </span>
        <span className="flex-shrink-0 text-xs text-slate-500">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-2.5 border-t border-slate-700/40 p-3">
          <p className="text-[11px] text-slate-500">
            A chain runs image actions one after another, each on the previous result. Run one from
            the viewer&apos;s Chain button, or pick one to offer after every generation. Anything that
            costs Anlas asks first.
          </p>

          <label className="flex items-center justify-between gap-2 text-xs text-slate-400">
            <span>After each Generate</span>
            <select
              value={form.autoChainId ?? ''}
              onChange={(e) => form.set('autoChainId', e.target.value || null)}
              className="min-w-0 rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 outline-none border border-slate-700 focus:border-violet-500"
            >
              <option value="">Do nothing</option>
              {chains.map((c) => (
                <option key={c.id} value={c.id}>
                  Run &quot;{c.name}&quot;
                </option>
              ))}
            </select>
          </label>

          {chains.map((chain) => (
            <div key={chain.id} className="flex items-start gap-2 rounded-md bg-slate-900/40 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-200" title={chain.name}>
                  {chain.name}
                </p>
                <p className="truncate text-[10px] text-slate-500" title={chainSummary(chain)}>
                  {chainSummary(chain)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(chain)}
                className="flex-shrink-0 rounded bg-slate-700 px-2 py-0.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-violet-600"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => remove(chain)}
                title="Delete chain"
                className={`flex-shrink-0 text-xs transition-colors ${
                  confirmDelete === chain.id ? 'font-semibold text-red-400' : 'text-slate-600 hover:text-red-400'
                }`}
              >
                {confirmDelete === chain.id ? 'Delete?' : '✕'}
              </button>
            </div>
          ))}
          {chains.length === 0 && <p className="text-xs italic text-slate-600">No chains yet.</p>}

          <button
            type="button"
            onClick={() => setEditing(null)}
            className="flex items-center gap-1.5 self-start text-xs text-slate-500 transition-colors hover:text-violet-400"
          >
            <span>+</span> New chain
          </button>
        </div>
      )}

      {editing !== undefined && <ChainEditorModal chain={editing} onClose={() => setEditing(undefined)} />}
    </div>
  );
}
