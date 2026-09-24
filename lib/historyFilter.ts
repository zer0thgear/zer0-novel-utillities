import { GeneratedImage } from '@/types/novelai';
import { modelShortName } from '@/lib/models';

// Filtering the session history. A long session runs to hundreds of images,
// and "the one with the red umbrella" is easier to type than to scroll to.

/** The character prompts an image was made with. They travel in the request
 *  parameters, not in `prompt` (which is the base prompt only); older V4
 *  requests may only carry them as v4_prompt captions. */
function characterPrompts(image: GeneratedImage): string[] {
  const params = image.parameters;
  if (params?.characterPrompts?.length) return params.characterPrompts.map((c) => c.prompt);
  return params?.v4_prompt?.caption.char_captions.map((c) => c.char_caption) ?? [];
}

/** Everything about an image the filter looks at: its prompt as sent and as
 *  written, its character prompts, the model, the seed, and the chain or
 *  sweep it belongs to. */
function haystack(image: GeneratedImage): string {
  return [
    image.prompt,
    image.source?.prompt,
    ...characterPrompts(image),
    modelShortName(image.model),
    String(image.seed),
    image.chain?.name,
    image.chain?.label,
    image.sweep?.x.name,
    image.sweep?.y?.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** True when every word of the query appears somewhere in the image, so
 *  "red 1girl" finds an image that's both, in either order. */
export function imageMatches(image: GeneratedImage, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = haystack(image);
  return words.every((word) => text.includes(word));
}

/** The images a query leaves, in their existing order. */
export function filterImages(images: GeneratedImage[], query: string): GeneratedImage[] {
  return query.trim() ? images.filter((image) => imageMatches(image, query)) : images;
}
