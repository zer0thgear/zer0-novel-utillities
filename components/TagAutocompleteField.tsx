'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NovelAIModel } from '@/types/novelai';
import { TagSuggestion, useTagSuggestions } from '@/hooks/useTagSuggestions';
import { currentSegment, applySegment, relevanceBrightness } from '@/lib/tagAutocomplete';
import { isRandomEntry, randomOptions } from '@/lib/wildcards';
import { useSettingsStore } from '@/store/settingsStore';

/** A tag from NovelAI, or (with `hint`) a Tidbit Library reference. */
type Suggestion = TagSuggestion & { hint?: string };

const DROPDOWN_MAX_HEIGHT = 240;
const VIEWPORT_MARGIN = 8;

// Shared tag-autocomplete wiring for any single-line/multi-line text field
// that should get live suggest-tags autocomplete — the base prompt, a
// character's prompt/negative prompt, or a prompt tidbit's text. Each
// instance manages its own suggestion state independently (only one field
// can be focused at a time anyway), so this drops in anywhere without a
// shared "which field is active" coordinator.
interface TagAutocompleteFieldProps {
  as?: 'textarea' | 'input';
  value: string;
  onChange: (value: string) => void;
  model: NovelAIModel;
  apiKey: string;
  className: string;
  /** Wraps the field + dropdown; override when the field lives in a flex row
   *  (e.g. a tidbit's text input) so the dropdown's width tracks the field,
   *  not the whole row. Defaults to a block-level relative wrapper. */
  wrapperClassName?: string;
  placeholder?: string;
  rows?: number;
  /** Enter (no Shift, not IME-composing) submits the form — matches
   *  NovelAI's own base prompt box. Off by default; only the base prompt
   *  opts in, since Enter submitting from a character-prompt or tidbit
   *  field would be surprising. */
  enterToSubmit?: boolean;
}

export function TagAutocompleteField({
  as = 'textarea',
  value,
  onChange,
  model,
  apiKey,
  className,
  wrapperClassName = 'relative',
  placeholder,
  rows,
  enterToSubmit = false,
}: TagAutocompleteFieldProps) {
  const [cursor, setCursor] = useState<number | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);
  // Decoupled from the raw suggestions array so a stray cursor/selection
  // event right after Escape doesn't silently reopen the dropdown.
  const [dismissed, setDismissed] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const [placement, setPlacement] = useState<{
    left: number;
    width: number;
    maxHeight: number;
    top?: number;
    bottom?: number;
  } | null>(null);

  const library = useSettingsStore((s) => s.tidbitLibrary);
  const query = cursor !== null ? currentSegment(value, cursor) : '';
  // A segment starting with `__` is a library reference being typed, so
  // suggest labels locally instead of asking NovelAI for tags.
  const libraryQuery = query.startsWith('__') ? query.slice(2).replace(/_+$/, '').toLowerCase() : null;
  const { suggestions: tagSuggestions } = useTagSuggestions(libraryQuery === null ? query : '', model, apiKey);
  const rawSuggestions: Suggestion[] =
    libraryQuery === null ? tagSuggestions : librarySuggestions(libraryQuery);
  const suggestions = dismissed ? [] : rawSuggestions;

  function librarySuggestions(q: string): Suggestion[] {
    const seen = new Set<string>();
    return library
      .map((entry) => ({ entry, label: entry.label.trim() }))
      .filter(({ label }) => {
        const key = label.toLowerCase();
        if (!label || seen.has(key) || !key.includes(q)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => Number(b.label.toLowerCase().startsWith(q)) - Number(a.label.toLowerCase().startsWith(q)))
      .slice(0, 8)
      .map(({ entry, label }) => ({
        tag: `__${label}__`,
        count: 10000,
        confidence: 0,
        hint: isRandomEntry(entry) ? `⚄ ${randomOptions(entry).length} options` : 'fixed',
      }));
  }
  const dropdownOpen = cursor !== null && suggestions.length > 0;

  // The field can sit inside any number of `overflow-hidden`/`overflow-auto`
  // ancestors (card corners, the sidebar's own scroll container, …) that
  // would otherwise clip an absolutely-positioned dropdown to whatever
  // sliver of space happens to be left. Rendering it into a `fixed`-position
  // portal on <body> escapes all of that, so it's computed here from the
  // field's live bounding rect instead of being laid out in normal flow.
  useLayoutEffect(() => {
    if (!dropdownOpen) return;

    function reposition() {
      const el = fieldRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
      const spaceAbove = rect.top - VIEWPORT_MARGIN;
      const placeAbove = spaceBelow < 120 && spaceAbove > spaceBelow;
      const available = placeAbove ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(80, Math.min(DROPDOWN_MAX_HEIGHT, available));
      setPlacement({
        left: rect.left,
        width: rect.width,
        maxHeight,
        ...(placeAbove
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
      });
    }

    reposition();
    // `scroll` doesn't bubble, so listen in the capture phase to catch it
    // firing on any scrollable ancestor, not just the window.
    window.addEventListener('resize', reposition);
    document.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      document.removeEventListener('scroll', reposition, true);
    };
  }, [dropdownOpen, suggestions.length]);

  function select(tag: string) {
    if (cursor === null) return;
    const { text, cursor: newCursor } = applySegment(value, cursor, tag);
    onChange(text);
    setCursor(newCursor);
    setHighlightIndex(0);
    // setTimeout rather than requestAnimationFrame, which the browser
    // pauses entirely while the tab is hidden/backgrounded.
    setTimeout(() => {
      fieldRef.current?.focus();
      fieldRef.current?.setSelectionRange(newCursor, newCursor);
    }, 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) {
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
      select(suggestions[highlightIndex].tag);
      return;
    }
    if (enterToSubmit && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  const sharedProps = {
    value,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      onChange(e.target.value);
      setCursor(e.target.selectionStart);
      setHighlightIndex(0);
      setDismissed(false);
    },
    onSelect: (e: React.SyntheticEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      setCursor(e.currentTarget.selectionStart);
    },
    onBlur: () => setTimeout(() => setCursor(null), 150),
    onKeyDown: handleKeyDown,
    placeholder,
    className,
  };

  return (
    <div className={wrapperClassName}>
      {as === 'textarea' ? (
        <textarea ref={fieldRef as React.Ref<HTMLTextAreaElement>} rows={rows} {...sharedProps} />
      ) : (
        <input ref={fieldRef as React.Ref<HTMLInputElement>} type="text" {...sharedProps} />
      )}
      {dropdownOpen &&
        placement &&
        createPortal(
          <div
            className="fixed z-50 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800 shadow-xl"
            style={{
              left: placement.left,
              width: placement.width,
              maxHeight: placement.maxHeight,
              ...(placement.top !== undefined ? { top: placement.top } : { bottom: placement.bottom }),
            }}
          >
            {suggestions.map((s, i) => (
              <button
                key={s.tag}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault(); // keep field focus so blur doesn't fire first
                  select(s.tag);
                }}
                onMouseEnter={() => setHighlightIndex(i)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                  i === highlightIndex ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                {/* Relevance dot — mirrors NovelAI's own "Did you mean?" chips,
                    which fade a dot from white (exact/very common) down to
                    near-invisible based on `count`, not `confidence`. */}
                <span
                  className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${s.hint ? 'bg-violet-400' : 'bg-white'}`}
                  style={{ opacity: s.hint ? 1 : relevanceBrightness(s.count) }}
                  title={
                    s.hint
                      ? 'Tidbit Library entry'
                      : `count ${s.count.toLocaleString()}${s.confidence ? `, confidence ${(s.confidence * 100).toFixed(0)}%` : ''}`
                  }
                />
                <span className="flex-1">{s.tag}</span>
                <span className="text-[10px] opacity-60">
                  {s.hint ?? (s.count >= 10000 ? '' : s.count.toLocaleString())}
                </span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
