import type { Img2ImgSource } from '@/store/sessionStore';
import { GeneratedImage } from '@/types/novelai';

// What the Edit / Inpaint canvas hands back, and how it becomes the
// Image2Image base, whether the canvas was opened on a history image or on
// the base already in the sidebar.

export type EditorMode = 'paint' | 'mask';

export interface EditorResult {
  /** The layer on its own, to reopen the editor with later: the paint (full
   *  size, transparent where untouched) or the mask (an eighth the size). */
  layer: Blob;
  /** Paint: the picture with the paint on it, ready to send. */
  composite?: Blob;
  /** Mask: black and white at full size, white where to regenerate. */
  mask?: Blob;
  /** Whether nothing was painted or masked at all. */
  empty: boolean;
}

/** Folds what the canvas saved into a base. An empty layer removes the paint
 *  or mask rather than keeping a blank one. */
export function applyEditorResult(src: Img2ImgSource, mode: EditorMode, result: EditorResult): Img2ImgSource {
  if (mode === 'paint') {
    const original = src.original ?? src.blob;
    if (result.empty || !result.composite) {
      return { ...src, blob: original, url: URL.createObjectURL(original), original: undefined, paint: undefined };
    }
    return {
      ...src,
      blob: result.composite,
      url: URL.createObjectURL(result.composite),
      original,
      paint: result.layer,
    };
  }
  if (result.empty || !result.mask) return { ...src, mask: undefined };
  return { ...src, mask: { layer: result.layer, full: result.mask, url: URL.createObjectURL(result.layer) } };
}

/** A new base from a history image, as the viewer's Edit and Inpaint start
 *  one: it remembers the image, so the result can be compared with it and
 *  its wildcard rolls are replayed. */
export function baseFromImage(image: GeneratedImage, picture: Blob): Img2ImgSource {
  return {
    blob: picture,
    url: URL.createObjectURL(picture),
    width: image.parameters.width,
    height: image.parameters.height,
    from: { imageId: image.id, picks: image.wildcardPicks },
  };
}
