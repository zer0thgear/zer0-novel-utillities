import { MAX_STEALTH_PIXELS, STEALTH_MAGIC } from '@/lib/naiMetadata';
import { NovelAIGenerateRequest, NovelAIModel } from '@/types/novelai';

// NovelAI's client sends every request image through one preparation step
// (confirmed 2026-09-18 from its bundle, and by running that step and its
// resizer in its own page against this code; see docs/REVERSE_ENGINEERING.md):
//   1. decode the image exactly;
//   2. if it carries stealth metadata, alpha 254 → 255 and 1 → 0;
//   3. resize it to the request's size, if different: Pica's lanczos3 for
//      images, nearest-neighbour for masks;
//   4. blend any transparency onto a background: white, black for masks,
//      none on V5 (which supports transparency);
//   5. re-encode it as PNG.
// Its canvas (Img2Img base, Inpaint, Edit) also erases the stealth bits when
// it loads an image, which eraseStealthMarks mirrors.

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

type Background = 'white' | 'black' | 'transparent';
const BACKGROUNDS: Record<Background, [number, number, number, number]> = {
  transparent: [0, 0, 0, 0],
  white: [255, 255, 255, 255],
  black: [0, 0, 0, 255],
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const isPng = (b: Uint8Array) => PNG_SIGNATURE.every((x, i) => b[i] === x);
const isJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

// ─── Base64 ────────────────────────────────────────────────────────────────────

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

// ─── Decoding ──────────────────────────────────────────────────────────────────

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 8-bit, non-interlaced RGB or RGBA PNGs (what NovelAI returns), decoded
 *  exactly; undefined for anything else. */
async function decodePngExactly(bytes: Uint8Array): Promise<Pixels | undefined> {
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
  if (!ihdr || idat.length === 0) return undefined;
  const colorType = ihdr[9];
  // Bit depth 8, RGB (2) or RGBA (6), no interlacing.
  if (ihdr[8] !== 8 || (colorType !== 2 && colorType !== 6) || ihdr[12] !== 0) return undefined;
  const header = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
  const width = header.getUint32(0);
  const height = header.getUint32(4);
  const channels = colorType === 6 ? 4 : 3;

  let compressed = idat[0];
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
  const stride = width * channels;
  if (filtered.length < height * (stride + 1)) return undefined;

  // Undo the per-row filters.
  const raw = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = filtered[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const value = filtered[src + x];
      const left = x >= channels ? raw[row + x - channels] : 0;
      const up = y > 0 ? raw[row - stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? raw[row - stride + x - channels] : 0;
      let out: number;
      switch (filter) {
        case 0: out = value; break;
        case 1: out = value + left; break;
        case 2: out = value + up; break;
        case 3: out = value + ((left + up) >> 1); break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
          out = value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default: return undefined;
      }
      raw[row + x] = out & 0xff;
    }
  }

  if (channels === 4) return { width, height, data: new Uint8ClampedArray(raw.buffer) };
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    data[p * 4] = raw[p * 3];
    data[p * 4 + 1] = raw[p * 3 + 1];
    data[p * 4 + 2] = raw[p * 3 + 2];
    data[p * 4 + 3] = 255;
  }
  return { width, height, data };
}

/** Other formats go through a canvas, which can nudge the colour of
 *  semi-transparent pixels (browsers premultiply alpha). */
async function decodeViaCanvas(bytes: Uint8Array): Promise<Pixels> {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]), {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not create a canvas');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width, height, data };
}

async function decodeImage(bytes: Uint8Array): Promise<Pixels> {
  return (isPng(bytes) ? await decodePngExactly(bytes) : undefined) ?? decodeViaCanvas(bytes);
}

// ─── Encoding ──────────────────────────────────────────────────────────────────

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function pngChunk(type: string, data: Uint8Array): Uint8Array {
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

/** A plain RGBA PNG (no row filters, no text chunks). */
async function encodePng({ width, height, data }: Pixels): Promise<Uint8Array> {
  const ihdr = new Uint8Array(13);
  const header = new DataView(ihdr.buffer);
  header.setUint32(0, width);
  header.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const rows = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) rows.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const parts = [
    new Uint8Array(PNG_SIGNATURE),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', await deflate(rows)),
    pngChunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// ─── The steps ─────────────────────────────────────────────────────────────────

/** Whether alpha starts with the stealth marker, read down each column. */
function hasStealthMarker({ width, height, data }: Pixels): boolean {
  if (width * height < STEALTH_MAGIC.length * 8) return false;
  for (let i = 0; i < STEALTH_MAGIC.length; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      const bit = i * 8 + b;
      const pixel = (bit % height) * width + Math.floor(bit / height);
      byte |= (data[pixel * 4 + 3] & 1) << (7 - b);
    }
    if (byte !== STEALTH_MAGIC.charCodeAt(i)) return false;
  }
  return true;
}

function clearStealthAlpha({ data }: Pixels) {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] === 254) data[i] = 255;
    else if (data[i] === 1) data[i] = 0;
  }
}

const sizeOf = (n: number) => Math.max(1, Math.round(n));

async function resizeSmooth(image: Pixels, width: number, height: number): Promise<Pixels> {
  const { default: Pica } = await import('pica');
  const out = await Pica().resizeBuffer({
    src: new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength),
    width: image.width,
    height: image.height,
    toWidth: width,
    toHeight: height,
    filter: 'lanczos3',
  });
  return { width, height, data: new Uint8ClampedArray(out.buffer, out.byteOffset, out.byteLength) };
}

function resizeNearest(image: Pixels, width: number, height: number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(image.height - 1, Math.floor(((y + 0.5) * image.height) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(image.width - 1, Math.floor(((x + 0.5) * image.width) / width));
      const from = (sy * image.width + sx) * 4;
      const to = (y * width + x) * 4;
      data[to] = image.data[from];
      data[to + 1] = image.data[from + 1];
      data[to + 2] = image.data[from + 2];
      data[to + 3] = image.data[from + 3];
    }
  }
  return { width, height, data };
}

/** "Source over" onto a solid colour, with NovelAI's arithmetic (writes into
 *  a Uint8ClampedArray round the same way). */
function fillBackground({ data }: Pixels, [r, g, b, a]: [number, number, number, number]) {
  if (a === 0) return;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255;
    if (alpha === 1) continue;
    const under = (a / 255) * (1 - alpha);
    const total = alpha + under;
    if (total === 0) continue;
    data[i] = (data[i] * alpha + r * under) / total;
    data[i + 1] = (data[i + 1] * alpha + g * under) / total;
    data[i + 2] = (data[i + 2] * alpha + b * under) / total;
    data[i + 3] = Math.round(255 * total);
  }
}

/** One request image, prepared as NovelAI's client prepares it. Falls back
 *  to the original if the image can't be decoded. */
export async function prepareRequestImage(
  b64: string,
  { width, height, background, smooth = true }: { width: number; height: number; background: Background; smooth?: boolean },
): Promise<string> {
  try {
    let image = await decodeImage(fromBase64(b64));
    if (image.width * image.height <= MAX_STEALTH_PIXELS && hasStealthMarker(image)) clearStealthAlpha(image);
    if (width && height && (image.width !== width || image.height !== height)) {
      const w = sizeOf(width);
      const h = sizeOf(height);
      image = smooth ? await resizeSmooth(image, w, h) : resizeNearest(image, w, h);
    }
    fillBackground(image, BACKGROUNDS[background]);
    return toBase64(await encodePng(image));
  } catch (err) {
    console.error('Could not prepare request image:', err);
    return b64;
  }
}

/** What NovelAI's canvas does on loading an image (Img2Img base, Inpaint,
 *  Edit): erase stealth metadata if present, otherwise leave it untouched. */
export async function eraseStealthMarks(blob: Blob): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (isJpeg(bytes)) return blob;
  if (isPng(bytes)) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(16) * view.getUint32(20) > MAX_STEALTH_PIXELS) return blob;
  }
  try {
    const image = await decodeImage(bytes);
    if (image.width * image.height > MAX_STEALTH_PIXELS || !hasStealthMarker(image)) return blob;
    clearStealthAlpha(image);
    return new Blob([(await encodePng(image)) as BlobPart], { type: 'image/png' });
  } catch {
    return blob;
  }
}

/** Only V5 supports transparency, so only V5 keeps it. */
const keepsTransparency = (model: NovelAIModel) => model.startsWith('nai-diffusion-5');

/**
 * The last step before sending, as NovelAI's client does it for any request
 * with an image: prepares the image and mask, turns SMEA off, and gives
 * extra_noise_seed its default of seed − 1.
 */
export async function finalizeImageRequest(request: NovelAIGenerateRequest): Promise<NovelAIGenerateRequest> {
  const p = request.parameters;
  if (!p.image && !p.mask) return request;
  const parameters = { ...p };
  if (p.image) {
    parameters.image = await prepareRequestImage(p.image, {
      width: p.width,
      height: p.height,
      background: keepsTransparency(request.model) ? 'transparent' : 'white',
    });
    parameters.sm = false;
    parameters.sm_dyn = false;
    if (parameters.extra_noise_seed === undefined) parameters.extra_noise_seed = p.seed - 1;
  }
  if (p.mask) {
    parameters.mask = await prepareRequestImage(p.mask, { width: p.width, height: p.height, background: 'black', smooth: false });
  }
  return { ...request, parameters };
}
