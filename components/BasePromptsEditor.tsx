'use client';

import { useState } from 'react';
import { BasePrompt, NovelAIModel, PromptMode, PromptTidbit } from '@/types/novelai';
import { createTidbit } from '@/lib/promptTidbits';
import { useTagSuggestions } from '@/hooks/useTagSuggestions';
import { useSessionStore } from '@/store/sessionStore';
import { currentSegment, applySegment } from '@/lib/tagAutocomplete';

// ─── Shared styles ────────────────────────────────────────────────────────────

const textareaCls =
  'w-full rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none border border-slate-700 focus:border-violet-500 transition-colors resize-y';

// ─── Props ────────────────────────────────────────────────────────────────────

interface BasePromptsEditorProps {
  basePrompts: BasePrompt[];
  promptMode: PromptMode;
  model: NovelAIModel;
  onChange: (basePrompts: BasePrompt[]) => void;
  onModeChange: (mode: PromptMode) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function BasePromptsEditor({
  basePrompts,
  promptMode,
  model,
  onChange,
  onModeChange,
}: BasePromptsEditorProps) {
  const apiKey = useSessionStore((s) => s.apiKey);

  // Tag autocomplete — only one textarea can be focused at a time, so a
  // single active { promptId, cursor } drives one suggest-tags query for
  // whichever prompt card is currently being typed in.
  const [active, setActive] = useState<{ promptId: string; cursor: number } | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);
  // Explicit dismiss flag, decoupled from `active`/`suggestions` — Escape
  // sets this without touching the query state, so a stray cursor/selection
  // event right after doesn't silently reopen the dropdown.
  const [dismissed, setDismissed] = useState(false);
  const activePrompt = active ? basePrompts.find((p) => p.id === active.promptId) : undefined;
  const query = active && activePrompt ? currentSegment(activePrompt.text, active.cursor) : '';
  const { suggestions: rawSuggestions } = useTagSuggestions(query, model, apiKey);
  const suggestions = dismissed ? [] : rawSuggestions;

  function selectSuggestion(promptId: string, cursor: number, tag: string) {
    const prompt = basePrompts.find((p) => p.id === promptId);
    if (!prompt) return;
    const { text, cursor: newCursor } = applySegment(prompt.text, cursor, tag);
    updatePrompt(promptId, { text });
    setActive({ promptId, cursor: newCursor });
    setHighlightIndex(0);
    // Restore focus + caret after the re-render. setTimeout rather than
    // requestAnimationFrame, which the browser pauses entirely while the tab
    // is hidden/backgrounded — this still needs to run then.
    setTimeout(() => {
      const el = document.querySelector<HTMLTextAreaElement>(`textarea[data-prompt-id="${promptId}"]`);
      el?.focus();
      el?.setSelectionRange(newCursor, newCursor);
    }, 0);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function addPrompt() {
    const next: BasePrompt = {
      id: crypto.randomUUID(),
      label: `Prompt ${basePrompts.length + 1}`,
      text: '',
      selected: false,
    };
    onChange([...basePrompts, next]);
  }

  function removePrompt(id: string) {
    const next = basePrompts.filter((p) => p.id !== id);
    // In single mode ensure something stays selected
    if (promptMode === 'single' && next.length > 0 && !next.some((p) => p.selected)) {
      next[0] = { ...next[0], selected: true };
    }
    onChange(next);
  }

  function updatePrompt(id: string, changes: Partial<BasePrompt>) {
    onChange(basePrompts.map((p) => (p.id === id ? { ...p, ...changes } : p)));
  }

  function addTidbit(promptId: string) {
    const prompt = basePrompts.find((p) => p.id === promptId);
    if (!prompt) return;
    const tidbits = prompt.tidbits ?? [];
    updatePrompt(promptId, { tidbits: [...tidbits, createTidbit(`Tidbit ${tidbits.length + 1}`)] });
  }

  function updateTidbit(promptId: string, tidbitId: string, changes: Partial<PromptTidbit>) {
    const prompt = basePrompts.find((p) => p.id === promptId);
    if (!prompt) return;
    updatePrompt(promptId, {
      tidbits: (prompt.tidbits ?? []).map((t) => (t.id === tidbitId ? { ...t, ...changes } : t)),
    });
  }

  function removeTidbit(promptId: string, tidbitId: string) {
    const prompt = basePrompts.find((p) => p.id === promptId);
    if (!prompt) return;
    updatePrompt(promptId, { tidbits: (prompt.tidbits ?? []).filter((t) => t.id !== tidbitId) });
  }

  function selectSingle(id: string) {
    onChange(basePrompts.map((p) => ({ ...p, selected: p.id === id })));
  }

  function toggleBatch(id: string, checked: boolean) {
    onChange(basePrompts.map((p) => (p.id === id ? { ...p, selected: checked } : p)));
  }

  function switchMode(mode: PromptMode) {
    if (mode === 'single') {
      // Keep only one selected when switching to single
      const firstSelected = basePrompts.find((p) => p.selected) ?? basePrompts[0];
      onChange(basePrompts.map((p) => ({ ...p, selected: p.id === firstSelected?.id })));
    }
    onModeChange(mode);
  }

  // ── Derived ──────────────────────────────────────────────────────────────

  const selectedCount = basePrompts.filter((p) => p.selected).length;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-2">
      {/* Header row: label + mode toggle */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Base Prompts
          {promptMode === 'batch' && selectedCount > 0 && (
            <span className="ml-1.5 normal-case font-normal text-violet-400">
              ({selectedCount} selected)
            </span>
          )}
        </span>

        {/* Single / Batch toggle */}
        <div className="flex overflow-hidden rounded-md border border-slate-700 text-xs">
          <button
            type="button"
            onClick={() => switchMode('single')}
            className={`px-2.5 py-1 transition-colors ${
              promptMode === 'single'
                ? 'bg-violet-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Single
          </button>
          <button
            type="button"
            onClick={() => switchMode('batch')}
            className={`px-2.5 py-1 transition-colors ${
              promptMode === 'batch'
                ? 'bg-violet-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Batch
          </button>
        </div>
      </div>

      {/* Prompt cards */}
      {basePrompts.map((prompt) => (
        <div
          key={prompt.id}
          className={`flex flex-col gap-2 rounded-lg border p-3 transition-colors ${
            prompt.selected
              ? 'border-violet-500/50 bg-slate-800/60'
              : 'border-slate-700/40 bg-slate-800/30'
          }`}
        >
          {/* Card header: select control + label input + remove */}
          <div className="flex items-center gap-2">
            {promptMode === 'single' ? (
              <input
                type="radio"
                checked={prompt.selected}
                onChange={() => selectSingle(prompt.id)}
                className="flex-shrink-0 accent-violet-500"
              />
            ) : (
              <input
                type="checkbox"
                checked={prompt.selected}
                onChange={(e) => toggleBatch(prompt.id, e.target.checked)}
                className="flex-shrink-0 accent-violet-500"
              />
            )}

            <input
              type="text"
              value={prompt.label}
              onChange={(e) => updatePrompt(prompt.id, { label: e.target.value })}
              placeholder="Label"
              className="min-w-0 flex-1 rounded bg-slate-700/60 px-2 py-0.5 text-xs text-slate-200 outline-none border border-transparent focus:border-violet-500/60 transition-colors"
            />

            {basePrompts.length > 1 && (
              <button
                type="button"
                onClick={() => removePrompt(prompt.id)}
                title="Remove prompt"
                className="flex-shrink-0 text-slate-600 hover:text-red-400 transition-colors text-xs leading-none"
              >
                ✕
              </button>
            )}
          </div>

          {/* Prompt text — Enter generates (matching NovelAI's own prompt box),
              Shift+Enter inserts a newline as usual. Tag autocomplete shows
              suggestions for whichever comma-segment the caret is in. */}
          <div className="relative">
            <textarea
              data-prompt-id={prompt.id}
              value={prompt.text}
              onChange={(e) => {
                updatePrompt(prompt.id, { text: e.target.value });
                setActive({ promptId: prompt.id, cursor: e.target.selectionStart });
                setHighlightIndex(0);
                setDismissed(false);
              }}
              onSelect={(e) => {
                const el = e.currentTarget;
                setActive({ promptId: prompt.id, cursor: el.selectionStart });
              }}
              onBlur={() => setTimeout(() => setActive((a) => (a?.promptId === prompt.id ? null : a)), 150)}
              onKeyDown={(e) => {
                const dropdownOpen = active?.promptId === prompt.id && suggestions.length > 0;
                if (dropdownOpen && e.key === 'ArrowDown') {
                  e.preventDefault();
                  setHighlightIndex((i) => (i + 1) % suggestions.length);
                  return;
                }
                if (dropdownOpen && e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHighlightIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
                  return;
                }
                if (dropdownOpen && e.key === 'Escape') {
                  e.preventDefault();
                  setDismissed(true);
                  return;
                }
                if (dropdownOpen && (e.key === 'Enter' || e.key === 'Tab') && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  selectSuggestion(prompt.id, active!.cursor, suggestions[highlightIndex].tag);
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="masterpiece, 1girl, solo, ..."
              rows={3}
              className={textareaCls}
            />
            {active?.promptId === prompt.id && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-slate-700 bg-slate-800 shadow-xl">
                {suggestions.map((s, i) => (
                  <button
                    key={s.tag}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault(); // keep textarea focus so blur doesn't fire first
                      selectSuggestion(prompt.id, active!.cursor, s.tag);
                    }}
                    onMouseEnter={() => setHighlightIndex(i)}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors ${
                      i === highlightIndex ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <span>{s.tag}</span>
                    <span className="text-[10px] opacity-60">{s.count >= 10000 ? '' : s.count.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tidbits — toggleable sub-prompts appended to the text above when enabled */}
          <div className="flex flex-col gap-1.5">
            {(prompt.tidbits ?? []).map((tidbit) => (
              <div key={tidbit.id} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={tidbit.enabled}
                  onChange={(e) => updateTidbit(prompt.id, tidbit.id, { enabled: e.target.checked })}
                  className="h-3.5 w-3.5 flex-shrink-0 accent-violet-500"
                />
                <input
                  type="text"
                  value={tidbit.label}
                  onChange={(e) => updateTidbit(prompt.id, tidbit.id, { label: e.target.value })}
                  placeholder="Label"
                  className="w-20 flex-shrink-0 rounded bg-slate-700/60 px-1.5 py-1 text-xs text-slate-300 outline-none border border-transparent focus:border-violet-500/60 transition-colors"
                />
                <input
                  type="text"
                  value={tidbit.text}
                  onChange={(e) => updateTidbit(prompt.id, tidbit.id, { text: e.target.value })}
                  placeholder="artist:name, ..."
                  className="min-w-0 flex-1 rounded bg-slate-900/50 px-2 py-1 text-xs text-slate-100 outline-none border border-slate-700/40 focus:border-violet-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => removeTidbit(prompt.id, tidbit.id)}
                  title="Remove tidbit"
                  className="flex-shrink-0 text-xs text-slate-600 hover:text-red-400 transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => addTidbit(prompt.id)}
              className="flex items-center gap-1 self-start text-xs text-slate-600 hover:text-violet-400 transition-colors"
            >
              <span>+</span> Add Tidbit
            </button>
          </div>
        </div>
      ))}

      {/* Add prompt */}
      <button
        type="button"
        onClick={addPrompt}
        className="flex items-center gap-1.5 self-start text-xs text-slate-500 hover:text-violet-400 transition-colors"
      >
        <span>+</span> Add Prompt
      </button>
    </div>
  );
}
