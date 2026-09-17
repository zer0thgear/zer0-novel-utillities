import { LibraryTidbit, PromptTidbit } from '@/types/novelai';
import { joinPromptParts } from '@/lib/promptText';

/** The library entry a tidbit is linked to, or undefined if it's a plain
 *  inline tidbit — or if its entry has since been deleted, in which case it
 *  degrades to a normal editable tidbit holding its last-known snapshot. */
export function linkedEntry(
  tidbit: PromptTidbit,
  library: LibraryTidbit[],
): LibraryTidbit | undefined {
  return tidbit.sourceId ? library.find((l) => l.id === tidbit.sourceId) : undefined;
}

/** A linked tidbit contributes the library entry's current text, so editing an
 *  entry updates every prompt using it. */
export function resolveTidbitText(tidbit: PromptTidbit, library: LibraryTidbit[]): string {
  return linkedEntry(tidbit, library)?.text ?? tidbit.text;
}

/** Appends each enabled tidbit's text to the base prompt text, in list order.
 *  Used identically everywhere a base/character prompt gets sent to the API —
 *  see PromptForm.tsx, useEnhance.ts, useInpaint.ts, useEdit.ts, useVariations.ts. */
export function composeWithTidbits(
  baseText: string,
  tidbits: PromptTidbit[] | undefined,
  library: LibraryTidbit[],
): string {
  const enabled = (tidbits ?? [])
    .filter((t) => t.enabled)
    .map((t) => resolveTidbitText(t, library));
  return joinPromptParts(baseText, ...enabled);
}

export function createTidbit(label: string): PromptTidbit {
  return { id: crypto.randomUUID(), label, text: '', enabled: true };
}

/** A prompt-level tidbit linked to a library entry. Label/text are snapshotted
 *  so the tidbit still reads sensibly if the entry is later deleted. */
export function createLinkedTidbit(entry: LibraryTidbit): PromptTidbit {
  return {
    id: crypto.randomUUID(),
    label: entry.label,
    text: entry.text,
    enabled: true,
    sourceId: entry.id,
  };
}
