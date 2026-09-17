'use client';

import { BasePrompt, NovelAIModel, PromptMode } from '@/types/novelai';
import { useSessionStore } from '@/store/sessionStore';
import { TagAutocompleteField } from '@/components/TagAutocompleteField';
import { TidbitList } from '@/components/TidbitList';
import { ReorderArrows } from '@/components/ReorderArrows';
import { moveItem } from '@/lib/promptText';

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

  function movePrompt(index: number, direction: 'up' | 'down') {
    onChange(moveItem(basePrompts, index, direction));
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
      {basePrompts.map((prompt, promptIndex) => (
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

            <ReorderArrows
              index={promptIndex}
              count={basePrompts.length}
              onMove={(direction) => movePrompt(promptIndex, direction)}
              label="prompt"
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
          <TagAutocompleteField
            as="textarea"
            rows={3}
            value={prompt.text}
            onChange={(text) => updatePrompt(prompt.id, { text })}
            model={model}
            apiKey={apiKey}
            placeholder="masterpiece, 1girl, solo, ..."
            className={textareaCls}
            enterToSubmit
          />

          {/* Tidbits — toggleable sub-prompts appended to the text above when enabled */}
          <TidbitList
            tidbits={prompt.tidbits ?? []}
            onChange={(tidbits) => updatePrompt(prompt.id, { tidbits })}
            model={model}
            apiKey={apiKey}
            placeholder="artist:name, ..."
          />
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
