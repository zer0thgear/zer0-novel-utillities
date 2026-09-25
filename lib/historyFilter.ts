import { GeneratedImage } from '@/types/novelai';
import { modelShortName } from '@/lib/models';

// Filtering the session history. A long session runs to hundreds of images,
// and "the one with the red umbrella" is easier to type than to scroll to.
//
// A query reads like a prompt: comma-separated tags, each one a phrase. So
// "blue hair, smile" finds images with the tag "blue hair" and the tag
// "smile" — not ones that merely have "blue" and "hair" somewhere, which is
// what a word-by-word match finds on "blue eyes, black hair".

/** Lower case, with runs of spaces and line breaks made single spaces. */
const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

/** The query's tags, in order, empties dropped. */
export function queryTerms(query: string): string[] {
  return query.split(',').map(normalize).filter(Boolean);
}

/** The character prompts an image was made with. They travel in the request
 *  parameters, not in `prompt` (which is the base prompt only); older V4
 *  requests may only carry them as v4_prompt captions. */
function characterPrompts(image: GeneratedImage): string[] {
  const params = image.parameters;
  if (params?.characterPrompts?.length) return params.characterPrompts.map((c) => c.prompt);
  return params?.v4_prompt?.caption.char_captions.map((c) => c.char_caption) ?? [];
}

/**
 * What a tag is matched against. The prompt as written — tidbits folded in,
 * wildcards rolled, but none of the quality tags every image shares — and
 * each character's prompt, which on V4 and later is where much of the
 * description lives. Then the labels an image carries: its model, and the
 * chain or sweep it came from.
 *
 * Fields are joined with " , " so a tag can never match across two of them.
 */
function haystack(image: GeneratedImage): string {
  return [
    image.source?.prompt ?? image.prompt,
    ...characterPrompts(image),
    modelShortName(image.model),
    image.chain?.name,
    image.chain?.label,
    image.sweep?.x.name,
    image.sweep?.y?.name,
  ]
    .filter((field): field is string => !!field)
    .map(normalize)
    .join(' , ');
}

/** A tag that's a plain number is a seed, and has to match one exactly —
 *  otherwise "4" would find every seed with a 4 anywhere in it. */
const isNumber = (term: string) => /^\d+$/.test(term);

/** True when every tag of the query is found in the image. */
export function imageMatches(image: GeneratedImage, query: string): boolean {
  const terms = queryTerms(query);
  if (terms.length === 0) return true;
  const text = haystack(image);
  return terms.every((term) => (isNumber(term) ? String(image.seed) === term : text.includes(term)));
}

/** The images a query leaves, in their existing order. */
export function filterImages(images: GeneratedImage[], query: string): GeneratedImage[] {
  return queryTerms(query).length > 0 ? images.filter((image) => imageMatches(image, query)) : images;
}
