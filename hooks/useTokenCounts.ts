'use client';

import { useEffect, useState } from 'react';
import type { FormSettings } from '@/store/settingsStore';
import { isRandomEntry, randomOptions, resolveRequestPrompts } from '@/lib/wildcards';
import { composeFinalPrompts } from '@/lib/imageRequest';
import { countPromptTokens, loadTokenCounter, TokenBudget, tokenBudget, TokenCounter } from '@/lib/tokenCount';

export interface TokenCounts {
  budget: TokenBudget;
  /** Each base prompt's final text (modifiers and quality tags included). */
  base: Record<string, number>;
  /** Enabled characters only. */
  characters: Record<string, { prompt: number; uc: number }>;
  /** The negative prompt as sent with the selected base prompt (the UC
   *  preset skips tags that prompt asks for, so it can vary by prompt). */
  negative: number;
  /** The largest selected base prompt, what the characters share the
   *  budget with (in Batch mode each selected prompt is its own request). */
  selectedBase: number;
  characterPromptTotal: number;
  characterUcTotal: number;
}

type Inputs = Pick<
  FormSettings,
  | 'model'
  | 'basePrompts'
  | 'characters'
  | 'negativePrompt'
  | 'tidbitLibrary'
  | 'furMode'
  | 'nsfwMode'
  | 'transparentBg'
  | 'qualityPreset'
  | 'ucPreset'
>;

const DEBOUNCE_MS = 150;

function computeCounts(form: Inputs, budget: TokenBudget, counter: TokenCounter): TokenCounts {
  const memo = new Map<string, number>();
  const count = (text: string) => {
    let n = memo.get(text);
    if (n === undefined) memo.set(text, (n = countPromptTokens(counter, text)));
    return n;
  };
  // Random wildcards count as their longest option: the budget has to hold
  // whichever one gets rolled.
  const longest: Record<string, string> = {};
  for (const entry of form.tidbitLibrary.filter(isRandomEntry)) {
    longest[entry.id] = randomOptions(entry).reduce((a, b) => (a.length >= b.length ? a : b), '');
  }

  const base: Record<string, number> = {};
  let negative = 0;
  let characters: TokenCounts['characters'] = {};
  let selectedBase = 0;
  const selected = form.basePrompts.filter((p) => p.selected);
  for (const prompt of form.basePrompts) {
    const resolved = resolveRequestPrompts(prompt, form.characters, form.negativePrompt, form.tidbitLibrary, undefined, longest);
    const final = composeFinalPrompts(form, resolved);
    base[prompt.id] = count(final.input);
    if (prompt.selected) selectedBase = Math.max(selectedBase, base[prompt.id]);
    if (prompt === (selected[0] ?? form.basePrompts[0])) {
      negative = count(final.negativePrompt);
      characters = Object.fromEntries(
        resolved.characters.map((c) => [c.id, { prompt: count(c.prompt), uc: count(c.uc) }]),
      );
    }
  }
  const charValues = Object.values(characters);
  return {
    budget,
    base,
    characters,
    negative,
    selectedBase,
    characterPromptTotal: charValues.reduce((sum, c) => sum + c.prompt, 0),
    characterUcTotal: charValues.reduce((sum, c) => sum + c.uc, 0),
  };
}

/** Live token counts for the prompt editor, or null while the tokenizer
 *  loads, if it failed to, or for a model this doesn't count (V3). */
export function useTokenCounts(form: Inputs): TokenCounts | null {
  const budget = tokenBudget(form.model);
  const kind = budget?.kind;
  const [counter, setCounter] = useState<{ kind: string; count: TokenCounter } | null>(null);
  const [counts, setCounts] = useState<TokenCounts | null>(null);

  useEffect(() => {
    if (!kind) return;
    let cancelled = false;
    loadTokenCounter(kind)
      .then((count) => !cancelled && setCounter({ kind, count }))
      .catch((err) => console.warn('Token counter unavailable:', err));
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const { model, basePrompts, characters, negativePrompt, tidbitLibrary } = form;
  const { furMode, nsfwMode, transparentBg, qualityPreset, ucPreset } = form;
  useEffect(() => {
    if (!budget || counter?.kind !== budget.kind) return;
    const timer = setTimeout(() => {
      const inputs = { model, basePrompts, characters, negativePrompt, tidbitLibrary };
      const modifiers = { furMode, nsfwMode, transparentBg, qualityPreset, ucPreset };
      setCounts(computeCounts({ ...inputs, ...modifiers }, budget, counter.count));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `budget` is derived from `model`, which is listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counter, model, basePrompts, characters, negativePrompt, tidbitLibrary, furMode, nsfwMode, transparentBg, qualityPreset, ucPreset]);

  // Hide stale numbers from another model family until the recount lands.
  return budget && counts?.budget.kind === budget.kind ? { ...counts, budget } : null;
}
