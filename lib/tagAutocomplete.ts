// Pure helpers for comma-segment tag autocomplete — shared by any textarea
// that wants suggest-tags-style autocomplete (currently just the base prompt,
// see components/BasePromptsEditor.tsx).

/** Segments break on commas and line breaks — the latter matter for random
 *  wildcard entries (one option per line) and Shift+Enter in prompt boxes. */
function segmentStart(text: string, cursor: number): number {
  const beforeCursor = text.slice(0, cursor);
  return Math.max(beforeCursor.lastIndexOf(','), beforeCursor.lastIndexOf('\n')) + 1;
}

/** The segment the cursor is currently inside, trimmed — this is what gets
 *  sent to the suggest-tags API as `prompt`. */
export function currentSegment(text: string, cursor: number): string {
  return text.slice(segmentStart(text, cursor), cursor).trimStart();
}

/** Replaces the segment the cursor was in with `tag`, preserving everything
 *  else, and returns the new full text plus where the cursor should land
 *  (right after the inserted tag, followed by ", " ready for the next one). */
export function applySegment(text: string, cursor: number, tag: string): { text: string; cursor: number } {
  const afterCursor = text.slice(cursor);
  const start = segmentStart(text, cursor);
  const prefix = text.slice(0, start);
  const needsSpace = start > 0 && !prefix.endsWith(' ') && !prefix.endsWith('\n');
  const insertion = `${needsSpace ? ' ' : ''}${tag}, `;
  const newText = prefix + insertion + afterCursor.trimStart();
  return { text: newText, cursor: prefix.length + insertion.length };
}

// Relevance-dot brightness (0-1) for a suggestion, matching NovelAI's own
// "Did you mean?" chips. Confirmed live 2026-09-17 by reading the computed
// background-color of the actual dot element next to each chip and
// correlating it against the raw API response for the same query — the
// dot brightness tracks `count`, NOT the `confidence` field (two tags with
// the same confidence but very different counts had very different dot
// brightness). Exact prefix matches are always capped at count:10000 and
// always render fully bright.
//
// This isn't a formula NovelAI publishes — it's a curve fit through the
// real (count, brightness) pairs read off the live page for one query
// ("blue ha" against nai-diffusion-5-curated):
//   count=40 -> 0.025, count=104 -> 0.034, count=404 -> 0.063,
//   count=1844 -> 0.202, count=5144 -> 0.524, count>=10000 -> 1.0
// Interpolated linearly in log10(count) space between those anchors, same
// empirical-fit approach used for the Anlas cost formula — treat it as a
// close visual approximation, not a byte-exact port.
const RELEVANCE_CURVE: [log10Count: number, brightness: number][] = [
  [0, 0.02],
  [1.602, 0.025],
  [2.017, 0.034],
  [2.606, 0.063],
  [3.266, 0.202],
  [3.711, 0.524],
  [4, 1],
];

export function relevanceBrightness(count: number): number {
  if (count >= 10000) return 1;
  if (count <= 1) return RELEVANCE_CURVE[0][1];
  const x = Math.log10(count);
  for (let i = 1; i < RELEVANCE_CURVE.length; i++) {
    const [x1, y1] = RELEVANCE_CURVE[i - 1];
    const [x2, y2] = RELEVANCE_CURVE[i];
    if (x <= x2) {
      const t = (x - x1) / (x2 - x1);
      return y1 + t * (y2 - y1);
    }
  }
  return 1;
}
