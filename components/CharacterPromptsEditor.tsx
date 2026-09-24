'use client';

import { useEffect, useRef, useState } from 'react';
import { CharacterPromptEntry, NovelAIModel } from '@/types/novelai';
import { useSessionStore } from '@/store/sessionStore';
import { TagAutocompleteField } from '@/components/TagAutocompleteField';
import { TidbitList } from '@/components/TidbitList';
import { ReorderArrows } from '@/components/ReorderArrows';
import { moveItemAmong } from '@/lib/promptText';
import { TokenMeter } from '@/components/TokenMeter';
import type { TokenCounts } from '@/hooks/useTokenCounts';

interface Props {
  characters: CharacterPromptEntry[];
  onChange: (characters: CharacterPromptEntry[]) => void;
  /** Max simultaneously-enabled characters, per the selected model (see lib/models.ts). */
  maxEnabled?: number;
  model: NovelAIModel;
  tokens?: TokenCounts | null;
  /** Scroll to, and briefly highlight, this character (set by clicking its
   *  marker on the position canvas). A fresh object each time, so asking for
   *  the same character twice still jumps. */
  jumpTo?: { id: string } | null;
}

type ActiveTab = 'prompt' | 'uc';

/** The filter bar only shows up once a cast is big enough to need it. */
const FILTER_MIN_CHARACTERS = 4;

const matchesQuery = (c: CharacterPromptEntry, q: string) =>
  [c.label, c.prompt, c.uc].some((f) => f?.toLowerCase().includes(q));

export function CharacterPromptsEditor({ characters, onChange, maxEnabled = 6, model, tokens, jumpTo }: Props) {
  const apiKey = useSessionStore((s) => s.apiKey);
  const [activeTabs, setActiveTabs] = useState<Record<string, ActiveTab>>({});
  const [query, setQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());

  const live = characters.filter((c) => !c.archived);
  const archived = characters.filter((c) => c.archived);
  const enabledCount = live.filter((c) => c.enabled).length;
  const atCap = enabledCount >= maxEnabled;

  const q = query.trim().toLowerCase();
  const filtering = q !== '' || activeOnly;
  const isShown = (c: CharacterPromptEntry) =>
    !c.archived && (!activeOnly || c.enabled) && (!q || matchesQuery(c, q));
  const visible = live.filter(isShown);
  const anyOpen = visible.some((c) => !c.collapsed);

  // A jump clears a text filter that would hide its target. (Adjusted during
  // render rather than in an effect, per React's "you might not need an effect".)
  const [seenJump, setSeenJump] = useState(jumpTo);
  if (jumpTo !== seenJump) {
    setSeenJump(jumpTo);
    if (jumpTo) {
      const target = characters.find((c) => c.id === jumpTo.id);
      if (target && q && !matchesQuery(target, q)) setQuery('');
      setFlashId(jumpTo.id);
    }
  }

  useEffect(() => {
    if (!jumpTo) return;
    cardRefs.current.get(jumpTo.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = setTimeout(() => setFlashId(null), 1500);
    return () => clearTimeout(timer);
  }, [jumpTo]);

  const addCharacter = () => {
    const entry: CharacterPromptEntry = {
      id: crypto.randomUUID(),
      prompt: '',
      uc: '',
      center: { x: 0.5, y: 0.5 },
      // Auto-disable if already at the cap
      enabled: !atCap,
    };
    onChange([...characters, entry]);
    // A blank character matches no filter, so it'd vanish on arrival.
    setQuery('');
    setActiveOnly(false);
  };

  const remove = (id: string) => {
    onChange(characters.filter((c) => c.id !== id));
    setActiveTabs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const update = (id: string, patch: Partial<CharacterPromptEntry>) =>
    onChange(characters.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const toggleCollapsed = (char: CharacterPromptEntry) => update(char.id, { collapsed: !char.collapsed });

  /** Folds (or unfolds) everything the filter is showing. */
  const setAllCollapsed = (collapsed: boolean) =>
    onChange(characters.map((c) => (isShown(c) ? { ...c, collapsed } : c)));

  const moveCharacter = (id: string, direction: 'up' | 'down') =>
    onChange(moveItemAmong(characters, id, direction, isShown));

  const archive = (id: string) => update(id, { archived: true, enabled: false });

  /** Back to the bottom of the list, turned on if there's room. */
  const restore = (id: string) => {
    const char = characters.find((c) => c.id === id);
    if (!char) return;
    onChange([
      ...characters.filter((c) => c.id !== id),
      { ...char, archived: false, enabled: !atCap, collapsed: false },
    ]);
  };

  const getTab = (id: string): ActiveTab => activeTabs[id] ?? 'prompt';

  const setTab = (id: string, tab: ActiveTab) =>
    setActiveTabs((prev) => ({ ...prev, [id]: tab }));

  return (
    <div className="flex flex-col gap-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Characters
          {live.length > 0 && (
            <span
              className={`ml-1.5 font-normal normal-case tracking-normal ${
                atCap ? 'text-violet-400' : 'text-slate-600'
              }`}
            >
              ({enabledCount}/{maxEnabled} active)
            </span>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          {visible.length > 1 && (
            <button
              type="button"
              onClick={() => setAllCollapsed(anyOpen)}
              title={anyOpen ? 'Fold every character down to its header' : 'Unfold every character'}
              className="rounded px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-700 hover:text-slate-200"
            >
              {anyOpen ? 'Fold all' : 'Unfold all'}
            </button>
          )}
          <button
            type="button"
            onClick={addCharacter}
            className="rounded px-2.5 py-1 text-xs bg-slate-700 text-slate-300 hover:bg-violet-600 hover:text-white transition-colors"
          >
            + Add
          </button>
        </div>
      </div>

      {/* Filter — narrows the list by name or prompt text, or to active ones */}
      {(live.length >= FILTER_MIN_CHARACTERS || filtering) && (
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
              placeholder="Filter by name or prompt…"
              className="w-full rounded-lg border border-slate-700/40 bg-slate-900/50 px-2.5 py-1 pr-6 text-xs text-slate-200 placeholder-slate-600 outline-none transition-colors focus:border-violet-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                title="Clear filter"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-slate-600 hover:text-slate-300"
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setActiveOnly((v) => !v)}
            title="Only show characters that are turned on"
            className={`flex-shrink-0 rounded-lg border px-2.5 py-1 text-xs transition-colors ${
              activeOnly
                ? 'border-violet-500/60 bg-violet-600/20 text-violet-300'
                : 'border-slate-700/40 text-slate-500 hover:text-slate-300'
            }`}
          >
            Active only
          </button>
        </div>
      )}
      {filtering && visible.length < live.length && (
        <p className="-mt-1 text-xs text-slate-600">
          Showing {visible.length} of {live.length}.{' '}
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setActiveOnly(false);
            }}
            className="text-violet-400 hover:text-violet-300"
          >
            Show all
          </button>
        </p>
      )}

      {/* Character cards */}
      {visible.map((char, visibleIndex) => {
        const tab = getTab(char.id);
        const canEnable = char.enabled || !atCap;
        const folded = !!char.collapsed;
        // Numbered by place in the whole (unarchived) list, so a filter
        // doesn't renumber anyone and the canvas markers match.
        const number = live.indexOf(char) + 1;

        return (
          <div
            key={char.id}
            ref={(el) => {
              if (el) cardRefs.current.set(char.id, el);
              else cardRefs.current.delete(char.id);
            }}
            className={`overflow-hidden rounded-lg border transition-colors ${
              flashId === char.id
                ? 'border-violet-400 ring-2 ring-violet-500/50'
                : char.enabled
                ? 'border-slate-700'
                : 'border-slate-800/60'
            } ${char.enabled ? 'bg-slate-800/50' : 'bg-slate-900/20'}`}
          >
            {/* Card header */}
            <div
              className={`flex items-center justify-between border-b px-3 py-2 transition-colors ${
                char.enabled
                  ? 'border-slate-700 bg-slate-800'
                  : 'border-slate-800/60 bg-slate-900/40'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleCollapsed(char)}
                title={folded ? 'Show this character' : 'Fold this character away'}
                className="mr-1.5 flex-shrink-0 text-xs text-slate-600 transition-colors hover:text-slate-300"
              >
                {folded ? '▸' : '▾'}
              </button>
              <input
                type="text"
                value={char.label ?? ''}
                onChange={(e) => update(char.id, { label: e.target.value })}
                placeholder={`Character ${number}`}
                className={`min-w-0 bg-transparent text-xs font-semibold outline-none placeholder-slate-600 transition-colors ${
                  folded ? 'w-24 flex-shrink-0' : 'flex-1'
                } ${char.enabled ? 'text-slate-300' : 'text-slate-600'}`}
              />
              {/* Folded: the prompt itself stands in for the card. */}
              {folded && (
                <span className="min-w-0 flex-1 truncate px-1.5 text-xs text-slate-600" title={char.prompt}>
                  {char.prompt || <span className="italic">empty</span>}
                </span>
              )}

              <div className="flex items-center gap-3">
                {/* Enabled toggle */}
                <label
                  className={`flex items-center gap-1.5 text-xs transition-colors ${
                    canEnable ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'
                  }`}
                  title={
                    !canEnable
                      ? `Maximum ${maxEnabled} characters can be active at once`
                      : char.enabled
                      ? 'Disable this character'
                      : 'Enable this character'
                  }
                >
                  <span className={char.enabled ? 'text-violet-400' : 'text-slate-600'}>
                    {char.enabled ? 'On' : 'Off'}
                  </span>
                  <input
                    type="checkbox"
                    checked={char.enabled}
                    disabled={!canEnable}
                    onChange={(e) => update(char.id, { enabled: e.target.checked })}
                    className="h-3.5 w-3.5 accent-violet-500 disabled:cursor-not-allowed"
                  />
                </label>

                <ReorderArrows
                  index={visibleIndex}
                  count={visible.length}
                  onMove={(direction) => moveCharacter(char.id, direction)}
                  label="character"
                />

                <button
                  type="button"
                  onClick={() => archive(char.id)}
                  title="Archive: keep this character, but out of the list and out of requests"
                  className="text-xs text-slate-600 transition-colors hover:text-amber-400"
                >
                  Archive
                </button>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => remove(char.id)}
                  title="Remove character"
                  className="text-xs text-slate-600 hover:text-red-400 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Card body — dimmed when disabled, hidden when folded */}
            <div className={`transition-opacity ${char.enabled ? 'opacity-100' : 'opacity-40'} ${folded ? 'hidden' : ''}`}>
              {/* Tab buttons */}
              <div className="flex border-b border-slate-700/60">
                {(['prompt', 'uc'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(char.id, t)}
                    className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                      tab === t
                        ? 'border-b-2 border-violet-500 bg-violet-600/10 text-violet-300'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {t === 'prompt' ? 'Prompt' : 'Negative'}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex flex-col gap-2.5 p-3">
                <TagAutocompleteField
                  as="textarea"
                  rows={3}
                  value={tab === 'prompt' ? char.prompt : char.uc}
                  onChange={(text) =>
                    update(char.id, { [tab === 'prompt' ? 'prompt' : 'uc']: text })
                  }
                  model={model}
                  apiKey={apiKey}
                  placeholder={
                    tab === 'prompt'
                      ? 'girl, solo, anthro, …'
                      : 'negative tags for this character…'
                  }
                  className="w-full resize-none rounded-lg bg-slate-900/50 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none border border-slate-700/40 focus:border-violet-500 transition-colors"
                />

                {/* Tidbits — toggleable sub-prompts appended to the field
                    above when enabled; each tab keeps its own. */}
                <TidbitList
                  tidbits={(tab === 'prompt' ? char.tidbits : char.ucTidbits) ?? []}
                  onChange={(tidbits) =>
                    update(char.id, tab === 'prompt' ? { tidbits } : { ucTidbits: tidbits })
                  }
                  model={model}
                  apiKey={apiKey}
                  placeholder={tab === 'prompt' ? 'red dress, ...' : 'bad hands, ...'}
                  labelWidthCls="w-16"
                />

                {tokens?.characters[char.id] && (
                  <CharacterTokenMeter tokens={tokens} id={char.id} tab={tab} />
                )}

                {/* Position inputs */}
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-600">Position</span>
                  {(['x', 'y'] as const).map((axis) => (
                    <label key={axis} className="flex items-center gap-1.5">
                      <span className="uppercase text-slate-600">{axis}</span>
                      <input
                        type="number"
                        value={char.center[axis]}
                        onChange={(e) =>
                          update(char.id, {
                            center: {
                              ...char.center,
                              [axis]: Math.min(1, Math.max(0, Number(e.target.value))),
                            },
                          })
                        }
                        min={0}
                        max={1}
                        step={0.01}
                        className="w-16 rounded bg-slate-900/60 px-2 py-0.5 text-slate-300 outline-none border border-slate-700/40 focus:border-violet-500 transition-colors"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {live.length === 0 ? (
        <p className="text-xs italic text-slate-600">
          {archived.length > 0
            ? 'No characters in the list. Restore one from the archive, or add a new one.'
            : 'Add characters to use v4 per-character prompts.'}
        </p>
      ) : filtering && visible.length === 0 ? (
        <p className="text-xs italic text-slate-600">No characters match the filter.</p>
      ) : (
        /* A second Add, so a long cast doesn't mean scrolling back up. */
        <button
          type="button"
          onClick={addCharacter}
          className="self-start rounded px-2.5 py-1 text-xs text-slate-500 transition-colors hover:bg-violet-600 hover:text-white"
        >
          + Add character
        </button>
      )}

      {/* Archive — characters kept for later, out of the list and never sent */}
      {archived.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-800/60">
          <button
            type="button"
            onClick={() => setShowArchive((v) => !v)}
            className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs text-slate-500 transition-colors hover:text-slate-300"
          >
            <span className="text-slate-600">{showArchive ? '▾' : '▸'}</span>
            <span className="font-semibold uppercase tracking-wider">Archive</span>
            <span className="text-slate-600">({archived.length})</span>
          </button>
          {showArchive && (
            <ul className="flex flex-col border-t border-slate-800/60">
              {archived.map((char) => (
                <li key={char.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                  <span className="w-24 flex-shrink-0 truncate font-semibold text-slate-400" title={char.label}>
                    {char.label || <span className="font-normal italic text-slate-600">Unnamed</span>}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-600" title={char.prompt}>
                    {char.prompt || <span className="italic">empty</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => restore(char.id)}
                    title={atCap ? 'Back into the list (turned off: the active limit is reached)' : 'Back into the list, turned on'}
                    className="flex-shrink-0 text-slate-500 transition-colors hover:text-violet-400"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(char.id)}
                    title="Delete for good"
                    className="flex-shrink-0 text-slate-600 transition-colors hover:text-red-400"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function CharacterTokenMeter({ tokens, id, tab }: { tokens: TokenCounts; id: string; tab: ActiveTab }) {
  const own = tokens.characters[id][tab];
  return tab === 'prompt' ? (
    <TokenMeter
      own={own}
      others={tokens.selectedBase + tokens.characterPromptTotal - own}
      othersLabel="Base prompt and other characters"
      budget={tokens.budget}
    />
  ) : (
    <TokenMeter
      own={own}
      others={tokens.negative + tokens.characterUcTotal - own}
      othersLabel="Negative prompt and other characters"
      budget={tokens.budget}
    />
  );
}
