// Shortening a request for display. A request carrying an Img2Img base, an
// Inpaint mask or an Edit canvas holds megabytes of base64 in one string,
// which is unreadable and swamps everything worth looking at.

/** Longer than any field that's meant to be read. */
const LONG_STRING = 256;

/** Replaces long base64 blobs with a note about their size, everywhere in a
 *  request, leaving the rest of it exactly as it is. */
export function redactRequest(value: unknown): unknown {
  if (typeof value === 'string' && value.length > LONG_STRING) {
    return `<${Math.round((value.length * 3) / 4 / 1024).toLocaleString()} KB of image data>`;
  }
  if (Array.isArray(value)) return value.map(redactRequest);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, v]) => [key, redactRequest(v)]),
    );
  }
  return value;
}
