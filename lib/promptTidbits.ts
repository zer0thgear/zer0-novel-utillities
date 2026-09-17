import { PromptTidbit } from '@/types/novelai';
import { joinPromptParts } from '@/lib/promptText';

/** Appends each enabled tidbit's text to the base prompt text, in list order.
 *  Used identically everywhere a base/character prompt gets sent to the API —
 *  see PromptForm.tsx, useEnhance.ts, useInpaint.ts, useEdit.ts, useVariations.ts. */
export function composeWithTidbits(baseText: string, tidbits: PromptTidbit[] | undefined): string {
  const enabled = (tidbits ?? []).filter((t) => t.enabled).map((t) => t.text);
  return joinPromptParts(baseText, ...enabled);
}

export function createTidbit(label: string): PromptTidbit {
  return { id: crypto.randomUUID(), label, text: '', enabled: true };
}
