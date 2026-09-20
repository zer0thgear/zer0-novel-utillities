import { GeneratedImage } from '@/types/novelai';
import { modelShortName } from '@/lib/models';

// Filtering the session history. A long session runs to hundreds of images,
// and "the one with the red umbrella" is easier to type than to scroll to.

/** Everything about an image the filter looks at: its prompt as sent and as
 *  written, the model, the seed, and the chain or sweep it belongs to. */
function haystack(image: GeneratedImage): string {
  return [
    image.prompt,
    image.source?.prompt,
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
