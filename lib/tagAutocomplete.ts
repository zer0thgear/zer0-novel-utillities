// Pure helpers for comma-segment tag autocomplete — shared by any textarea
// that wants suggest-tags-style autocomplete (currently just the base prompt,
// see components/BasePromptsEditor.tsx).

/** The comma-delimited segment the cursor is currently inside, trimmed —
 *  this is what gets sent to the suggest-tags API as `prompt`. */
export function currentSegment(text: string, cursor: number): string {
  const beforeCursor = text.slice(0, cursor);
  const start = beforeCursor.lastIndexOf(',') + 1;
  return text.slice(start, cursor).trimStart();
}

/** Replaces the segment the cursor was in with `tag`, preserving everything
 *  else, and returns the new full text plus where the cursor should land
 *  (right after the inserted tag, followed by ", " ready for the next one). */
export function applySegment(text: string, cursor: number, tag: string): { text: string; cursor: number } {
  const afterCursor = text.slice(cursor);
  const beforeCursor = text.slice(0, cursor);
  const segmentStart = beforeCursor.lastIndexOf(',') + 1;
  const prefix = text.slice(0, segmentStart);
  const needsSpace = segmentStart > 0 && !prefix.endsWith(' ');
  const insertion = `${needsSpace ? ' ' : ''}${tag}, `;
  const newText = prefix + insertion + afterCursor.trimStart();
  return { text: newText, cursor: prefix.length + insertion.length };
}
