// Shortening a request for display. A request carrying an Img2Img base, an
// Inpaint mask or an Edit canvas holds megabytes of base64 in one string,
// which is unreadable and swamps everything worth looking at.

/** Longer than any field that's meant to be read at a glance. A UC preset
 *  runs past this on its own, so length alone isn't enough to go on. */
const LONG_STRING = 256;
/** The fields that carry an image. */
const IMAGE_KEYS = new Set(['image', 'mask', 'reference_image', 'reference_image_multiple']);
/** Base64 and nothing else — a prompt has commas, braces and colons in it. */
const BASE64ISH = /^[A-Za-z0-9+/\s]+={0,2}$/;

const isImageData = (key: string | undefined, value: string) =>
  value.length > LONG_STRING && ((key !== undefined && IMAGE_KEYS.has(key)) || BASE64ISH.test(value));

/** Replaces image data with a note about its size, everywhere in a request,
 *  leaving the rest — long prompts included — exactly as it is. */
export function redactRequest(value: unknown, key?: string): unknown {
  if (typeof value === 'string') {
    return isImageData(key, value)
      ? `<${Math.round((value.length * 3) / 4 / 1024).toLocaleString()} KB of image data>`
      : value;
  }
  if (Array.isArray(value)) return value.map((item) => redactRequest(item, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactRequest(v, k)]),
    );
  }
  return value;
}
