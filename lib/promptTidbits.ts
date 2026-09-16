import { PromptTidbit } from '@/types/novelai';

/** Appends each enabled tidbit's text to the base prompt text, in list order.
 *  Used identically everywhere a base/character prompt gets sent to the API —
 *  see PromptForm.tsx, useEnhance.ts, useInpaint.ts, useEdit.ts, useVariations.ts. */
export function composeWithTidbits(baseText: string, tidbits: PromptTidbit[] | undefined): string {
  const enabledText = (tidbits ?? [])
    .filter((t) => t.enabled && t.text.trim())
    .map((t) => t.text.trim());
  if (enabledText.length === 0) return baseText;
  return baseText ? [baseText, ...enabledText].join(', ') : enabledText.join(', ');
}

export function createTidbit(label: string): PromptTidbit {
  return { id: crypto.randomUUID(), label, text: '', enabled: true };
}
