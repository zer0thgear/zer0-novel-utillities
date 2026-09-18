'use client';

import { useEffect, useState } from 'react';
import { saveAs } from 'file-saver';
import { useSettingsStore } from '@/store/settingsStore';
import { isRandomEntry, randomOptions } from '@/lib/wildcards';
import { presetSummary } from '@/lib/presets';
import {
  applyImport,
  buildExport,
  ImportMode,
  libraryNeeds,
  LIST_KEYS,
  ListKey,
  parseTransferFile,
  TransferFile,
  TransferSelection,
} from '@/lib/transfer';

interface Props {
  mode: 'export' | 'import';
  onClose: () => void;
  /** Called after a successful import, with a short description of it. */
  onImported: (message: string) => void;
}

interface Item {
  id: string;
  title: string;
  subtitle: string;
}

const LIST_TITLES: Record<ListKey, string> = {
  basePrompts: 'Base prompts',
  characters: 'Characters',
  tidbitLibrary: 'Tidbit Library',
  presets: 'Presets',
};

function itemsOf(source: Pick<TransferFile, ListKey>): Record<ListKey, Item[]> {
  return {
    basePrompts: (source.basePrompts ?? []).map((p) => ({ id: p.id, title: p.label || 'Untitled', subtitle: p.text })),
    characters: (source.characters ?? []).map((c, i) => ({ id: c.id, title: c.label || `Character ${i + 1}`, subtitle: c.prompt })),
    tidbitLibrary: (source.tidbitLibrary ?? []).map((e) => ({
      id: e.id,
      title: e.label || 'Untitled',
      subtitle: isRandomEntry(e) ? `⚄ ${randomOptions(e).join(' · ')}` : e.text,
    })),
    presets: (source.presets ?? []).map((p) => ({
      id: p.id,
      title: p.includesPrompts ? `${p.name} (+ prompts)` : p.name,
      subtitle: presetSummary(p),
    })),
  };
}

function allSelected(items: Record<ListKey, Item[]>, settings: boolean, negative: boolean): TransferSelection {
  return {
    lists: Object.fromEntries(LIST_KEYS.map((k) => [k, new Set(items[k].map((i) => i.id))])) as TransferSelection['lists'],
    settings,
    negativePrompt: negative,
  };
}

/** Pick what to export to a file, or what to take from an imported one. */
export function TransferModal({ mode, onClose, onImported }: Props) {
  const form = useSettingsStore();
  const [file, setFile] = useState<TransferFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<ListKey>>(new Set());
  const [modes, setModes] = useState<Record<ListKey, ImportMode>>({
    basePrompts: 'add', characters: 'add', tidbitLibrary: 'add', presets: 'add',
  });

  // What's on offer: the current sidebar when exporting, the file when importing.
  const source: TransferFile | null = mode === 'export'
    ? { app: 'zer0-novel-frontend', version: 1, exportedAt: '', basePrompts: form.basePrompts, characters: form.characters, tidbitLibrary: form.tidbitLibrary, presets: form.presets }
    : file;
  const items = source ? itemsOf(source) : null;
  const hasSettings = mode === 'export' || !!file?.settings;
  const hasNegative = mode === 'export' || file?.negativePrompt !== undefined;

  const [sel, setSel] = useState<TransferSelection | null>(() =>
    mode === 'export' ? allSelected(itemsOf(form), true, true) : null,
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function readFile(f: File) {
    const { file: parsed, error } = parseTransferFile(await f.text());
    setFileError(error ?? null);
    setFile(parsed ?? null);
    if (parsed) setSel(allSelected(itemsOf(parsed), !!parsed.settings, parsed.negativePrompt !== undefined));
  }

  // Library entries the chosen prompts/characters/presets need but that
  // aren't chosen themselves, so their links wouldn't survive the trip.
  const missing = source && sel
    ? libraryNeeds(source, source.tidbitLibrary ?? [], sel).filter((e) => !sel.lists.tidbitLibrary.has(e.id))
    : [];

  const count = sel
    ? LIST_KEYS.reduce((n, k) => n + sel.lists[k].size, 0) + (sel.settings ? 1 : 0) + (sel.negativePrompt ? 1 : 0)
    : 0;

  function toggleItem(key: ListKey, id: string) {
    if (!sel) return;
    const next = new Set(sel.lists[key]);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSel({ ...sel, lists: { ...sel.lists, [key]: next } });
  }

  function toggleList(key: ListKey, on: boolean) {
    if (!sel || !items) return;
    setSel({ ...sel, lists: { ...sel.lists, [key]: new Set(on ? items[key].map((i) => i.id) : []) } });
  }

  function run() {
    if (!sel) return;
    if (mode === 'export') {
      const out = buildExport(form, sel);
      const date = new Date().toISOString().slice(0, 10);
      saveAs(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }), `novelai-frontend-${date}.json`);
      onClose();
      return;
    }
    if (!file) return;
    const { changes, summary } = applyImport(form, file, sel, modes);
    useSettingsStore.setState(changes);
    onImported(summary.length ? `Imported ${summary.join(', ')}.` : 'Nothing to import.');
    onClose();
  }

  const checkbox = 'h-3.5 w-3.5 flex-shrink-0 accent-violet-500';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-full w-full max-w-md flex-col gap-4 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-100">{mode === 'export' ? 'Export' : 'Import'}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {mode === 'export'
                ? 'Choose what to save to a file you can back up or share.'
                : 'Choose what to bring in from an export file.'}
            </p>
          </div>
          <button type="button" onClick={onClose} title="Cancel" className="text-slate-500 hover:text-slate-200">
            ✕
          </button>
        </div>

        {mode === 'import' && (
          <label className="flex cursor-pointer flex-col gap-1 rounded-lg border border-dashed border-slate-700 px-3 py-3 text-xs text-slate-400 hover:border-violet-500/60">
            <span>{file ? 'Choose a different file…' : 'Choose an export file (.json)…'}</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
              className="text-xs text-slate-500 file:mr-2 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-slate-200"
            />
            {fileError && <span className="text-amber-400">{fileError}</span>}
          </label>
        )}

        {items && sel && (
          <div className="flex flex-col gap-2">
            {LIST_KEYS.filter((k) => items[k].length > 0).map((key) => {
              const chosen = sel.lists[key].size;
              const total = items[key].length;
              const open = expanded.has(key);
              return (
                <div key={key} className="rounded-lg bg-slate-800/50">
                  <div className="flex items-center gap-2 px-2.5 py-2">
                    <input
                      type="checkbox"
                      checked={chosen === total}
                      ref={(el) => {
                        if (el) el.indeterminate = chosen > 0 && chosen < total;
                      }}
                      onChange={(e) => toggleList(key, e.target.checked)}
                      className={checkbox}
                    />
                    <button
                      type="button"
                      onClick={() => setExpanded((s) => {
                        const n = new Set(s);
                        if (n.has(key)) n.delete(key);
                        else n.add(key);
                        return n;
                      })}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs text-slate-200"
                    >
                      <span className="font-semibold">{LIST_TITLES[key]}</span>
                      <span className="text-slate-500">{chosen} of {total}</span>
                      <span className="text-slate-600">{open ? '▾' : '▸'}</span>
                    </button>
                    {mode === 'import' && (
                      <div className="flex flex-shrink-0 overflow-hidden rounded border border-slate-700 text-[10px]">
                        {(['add', 'replace'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setModes((ms) => ({ ...ms, [key]: m }))}
                            title={m === 'add' ? 'Keep what you have and add these' : 'Replace what you have with these'}
                            className={`px-1.5 py-0.5 capitalize transition-colors ${
                              modes[key] === m ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {open && (
                    <div className="flex flex-col gap-1 border-t border-slate-700/50 px-2.5 py-2">
                      {items[key].map((item) => (
                        <label key={item.id} className="flex cursor-pointer items-start gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={sel.lists[key].has(item.id)}
                            onChange={() => toggleItem(key, item.id)}
                            className={`${checkbox} mt-0.5`}
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-slate-200">{item.title}</span>
                            <span className="block truncate text-[11px] text-slate-500" title={item.subtitle}>
                              {item.subtitle || '(empty)'}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {hasSettings && (
              <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-800/50 px-2.5 py-2 text-xs">
                <input
                  type="checkbox"
                  checked={sel.settings}
                  onChange={(e) => setSel({ ...sel, settings: e.target.checked })}
                  className={checkbox}
                />
                <span className="font-semibold text-slate-200">Generation settings</span>
                <span className="truncate text-slate-500">model, size, steps, CFG, sampler, modifiers</span>
              </label>
            )}
            {hasNegative && (
              <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-800/50 px-2.5 py-2 text-xs">
                <input
                  type="checkbox"
                  checked={sel.negativePrompt}
                  onChange={(e) => setSel({ ...sel, negativePrompt: e.target.checked })}
                  className={checkbox}
                />
                <span className="font-semibold text-slate-200">Negative prompt</span>
              </label>
            )}

            {missing.length > 0 && (
              <div className="flex items-start justify-between gap-2 rounded-lg border border-amber-600/40 bg-amber-950/20 px-2.5 py-2 text-xs text-amber-300">
                <span>
                  The selected prompts use {missing.length} library entr{missing.length === 1 ? 'y' : 'ies'} that
                  {missing.length === 1 ? " isn't" : " aren't"} selected: {missing.map((e) => e.label || 'Untitled').join(', ')}.
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSel({
                      ...sel,
                      lists: { ...sel.lists, tidbitLibrary: new Set([...sel.lists.tidbitLibrary, ...missing.map((e) => e.id)]) },
                    })
                  }
                  className="flex-shrink-0 rounded bg-amber-600/30 px-1.5 py-0.5 font-semibold text-amber-100 hover:bg-amber-600"
                >
                  Include
                </button>
              </div>
            )}

            {mode === 'import' && (LIST_KEYS.some((k) => modes[k] === 'replace' && sel.lists[k].size > 0)) && (
              <p className="text-[11px] text-amber-400">Replace discards what you currently have in that list.</p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={run}
            disabled={!sel || count === 0}
            className="flex-1 rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {mode === 'export' ? 'Download' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
