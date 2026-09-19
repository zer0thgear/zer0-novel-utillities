import { MAX_STEALTH_PIXELS, STEALTH_MAGIC } from '@/lib/naiMetadata';

// NovelAI's client, when it loads an image as an Img2Img base or into its
// Inpaint/Edit canvas, first erases stealth metadata (see naiMetadata.ts) if
// the image carries it: alpha 254 becomes 255 and 1 becomes 0, then it's
// re-encoded as PNG. Images without the marker, JPEGs and anything over
// 16,777,216 px are used as they are. Enhance and Variations send history
// images untouched, so this isn't applied there. Confirmed 2026-09-18 from
// its bundle and from the Img2Img request it actually sent.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Whether alpha (read by pixel index) starts with the stealth marker,
 *  reading bits down each column as NovelAI does. */
function hasStealthMarker(alphaAt: (pixel: number) => number, width: number, height: number): boolean {
  if (width * height < STEALTH_MAGIC.length * 8) return false;
  for (let i = 0; i < STEALTH_MAGIC.length; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      const bit = i * 8 + b;
      byte |= (alphaAt((bit % height) * width + Math.floor(bit / height)) & 1) << (7 - b);
    }
    if (byte !== STEALTH_MAGIC.charCodeAt(i)) return false;
  }
  return true;
}

const cleanAlpha = (a: number) => (a === 254 ? 255 : a === 1 ? 0 : a);

/** The image as NovelAI would send it as an Img2Img/Inpaint/Edit source. */
export async function clearStealthMarks(blob: Blob): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return blob; // JPEG
  const isPng = PNG_SIGNATURE.every((b, i) => bytes[i] === b);
  if (isPng) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(16) * view.getUint32(20) > MAX_STEALTH_PIXELS) return blob;
    const exact = await clearPngExactly(bytes);
    if (exact !== undefined) return exact ?? blob;
  }
  return clearViaCanvas(blob);
}

// ─── 8-bit RGBA PNGs: edit the pixel data directly ─────────────────────────────
// A canvas round trip would nudge the colour of semi-transparent pixels (the
// browser premultiplies alpha), so NovelAI's own images are handled exactly.

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < 8 + data.length; i++) crc = CRC_TABLE[(crc ^ out[i]) & 0xff] ^ (crc >>> 8);
  view.setUint32(8 + data.length, (crc ^ 0xffffffff) >>> 0);
  return out;
}

/**
 * Cleans an 8-bit, non-interlaced RGBA PNG without touching any colour.
 * Returns the cleaned PNG, null when it has no stealth marker (use it as is),
 * or undefined when it's some other kind of PNG (use the canvas path).
 */
async function clearPngExactly(bytes: Uint8Array): Promise<Blob | null | undefined> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let ihdr: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  for (let offset = 8; offset + 8 <= bytes.length; ) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  // Bit depth 8, colour type 6 (RGBA), no interlacing.
  if (!ihdr || ihdr[8] !== 8 || ihdr[9] !== 6 || ihdr[12] !== 0 || idat.length === 0) return undefined;
  const header = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
  const width = header.getUint32(0);
  const height = header.getUint32(4);

  let compressed: Uint8Array = idat[0];
  if (idat.length > 1) {
    compressed = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
    let at = 0;
    for (const d of idat) {
      compressed.set(d, at);
      at += d.length;
    }
  }
  let filtered: Uint8Array;
  try {
    filtered = await inflate(compressed);
  } catch {
    return undefined;
  }
  const stride = width * 4;
  if (filtered.length < height * (stride + 1)) return undefined;

  // Undo the per-row filters, leaving plain RGBA rows.
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = filtered[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const raw = filtered[src + x];
      const left = x >= 4 ? pixels[row + x - 4] : 0;
      const up = y > 0 ? pixels[row - stride + x] : 0;
      const upLeft = y > 0 && x >= 4 ? pixels[row - stride + x - 4] : 0;
      let value: number;
      switch (filter) {
        case 0: value = raw; break;
        case 1: value = raw + left; break;
        case 2: value = raw + up; break;
        case 3: value = raw + ((left + up) >> 1); break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
          value = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default: return undefined;
      }
      pixels[row + x] = value & 0xff;
    }
  }

  if (!hasStealthMarker((i) => pixels[i * 4 + 3], width, height)) return null;
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = cleanAlpha(pixels[i]);

  // Re-encode with no row filters, like a fresh export (text chunks dropped).
  const rows = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) rows.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  return new Blob(
    [
      new Uint8Array(PNG_SIGNATURE),
      chunk('IHDR', ihdr),
      chunk('IDAT', await deflate(rows)),
      chunk('IEND', new Uint8Array(0)),
    ] as BlobPart[],
    { type: 'image/png' },
  );
}

// ─── Anything else the browser can decode (WebP, other PNGs) ───────────────────

async function clearViaCanvas(blob: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  } catch {
    return blob;
  }
  const { width, height } = bitmap;
  if (width * height > MAX_STEALTH_PIXELS) {
    bitmap.close();
    return blob;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    return blob;
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const image = ctx.getImageData(0, 0, width, height);
  if (!hasStealthMarker((i) => image.data[i * 4 + 3], width, height)) return blob;
  for (let i = 3; i < image.data.length; i += 4) image.data[i] = cleanAlpha(image.data[i]);
  ctx.putImageData(image, 0, 0);
  return (await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))) ?? blob;
}
