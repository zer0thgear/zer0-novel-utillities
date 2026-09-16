// Client-side approximation of NovelAI's "Pixel Snap" Director Tool. NovelAI's own
// version runs entirely in-browser too (confirmed: it never touches the network —
// see memory/project_novelai_editing_tools_api.md) but its exact algorithm is
// proprietary. This downscales to an auto-detected (or explicit) pixel grid,
// optionally quantizes the palette with median-cut, and optionally snaps back
// up to roughly the original size with hard (nearest-neighbor) pixel edges.

export interface PixelSnapOptions {
  palettize: 'off' | 'auto' | 'custom';
  /** Target color count when palettize is 'custom'. Ignored for 'off'/'auto'. */
  colors?: number;
  /** Biases the auto block-size heuristic coarser, for a chunkier result. */
  avoidOverRefining?: boolean;
  /** Scale the downscaled result back up to ~the original size with hard edges. */
  upscale?: boolean;
}

const AUTO_COLORS = 64;
const AUTO_LONG_EDGE = 64; // target "pixel" count along the longer side
const AUTO_LONG_EDGE_COARSE = 48; // used when avoidOverRefining is set

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasFrom(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable.');
  return { canvas, ctx };
}

/** Downscale in halving steps for better quality than a single large jump. */
function downscale(img: HTMLImageElement, targetWidth: number, targetHeight: number): ImageData {
  let { canvas, ctx } = canvasFrom(img.width, img.height);
  ctx.drawImage(img, 0, 0);

  let currentWidth = img.width;
  let currentHeight = img.height;

  while (currentWidth / 2 > targetWidth && currentHeight / 2 > targetHeight) {
    const nextWidth = Math.max(targetWidth, Math.round(currentWidth / 2));
    const nextHeight = Math.max(targetHeight, Math.round(currentHeight / 2));
    const next = canvasFrom(nextWidth, nextHeight);
    next.ctx.imageSmoothingEnabled = true;
    next.ctx.imageSmoothingQuality = 'high';
    next.ctx.drawImage(canvas, 0, 0, nextWidth, nextHeight);
    canvas = next.canvas;
    ctx = next.ctx;
    currentWidth = nextWidth;
    currentHeight = nextHeight;
  }

  const final = canvasFrom(targetWidth, targetHeight);
  final.ctx.imageSmoothingEnabled = true;
  final.ctx.imageSmoothingQuality = 'high';
  final.ctx.drawImage(canvas, 0, 0, targetWidth, targetHeight);
  return final.ctx.getImageData(0, 0, targetWidth, targetHeight);
}

// ─── Median-cut color quantization ─────────────────────────────────────────────

interface ColorBox {
  pixels: number[][]; // [r, g, b, a] per pixel
}

function boxRange(box: ColorBox): { channel: 0 | 1 | 2; range: number } {
  let best: { channel: 0 | 1 | 2; range: number } = { channel: 0, range: -1 };
  for (const channel of [0, 1, 2] as const) {
    let min = 255, max = 0;
    for (const p of box.pixels) {
      if (p[channel] < min) min = p[channel];
      if (p[channel] > max) max = p[channel];
    }
    const range = max - min;
    if (range > best.range) best = { channel, range };
  }
  return best;
}

function medianCutPalette(pixels: number[][], targetColors: number): number[][] {
  const boxes: ColorBox[] = [{ pixels }];

  while (boxes.length < targetColors) {
    // Split the box with the largest channel range
    let splitIdx = -1;
    let splitInfo = { channel: 0 as 0 | 1 | 2, range: -1 };
    boxes.forEach((box, i) => {
      if (box.pixels.length < 2) return;
      const info = boxRange(box);
      if (info.range > splitInfo.range) {
        splitInfo = info;
        splitIdx = i;
      }
    });
    if (splitIdx === -1) break; // no more splittable boxes

    const box = boxes[splitIdx];
    const sorted = [...box.pixels].sort((a, b) => a[splitInfo.channel] - b[splitInfo.channel]);
    const mid = Math.floor(sorted.length / 2);
    boxes.splice(splitIdx, 1, { pixels: sorted.slice(0, mid) }, { pixels: sorted.slice(mid) });
  }

  return boxes.map((box) => {
    const n = box.pixels.length || 1;
    const sum = box.pixels.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2], acc[3] + p[3]], [0, 0, 0, 0]);
    return [Math.round(sum[0] / n), Math.round(sum[1] / n), Math.round(sum[2] / n), Math.round(sum[3] / n)];
  });
}

function nearestPaletteColor(r: number, g: number, b: number, palette: number[][]): number[] {
  let best = palette[0];
  let bestDist = Infinity;
  for (const c of palette) {
    const dist = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

function quantize(imageData: ImageData, targetColors: number): ImageData {
  const { data, width, height } = imageData;
  const pixels: number[][] = [];
  for (let i = 0; i < data.length; i += 4) {
    // Skip fully transparent pixels — they shouldn't bias the palette
    if (data[i + 3] > 0) pixels.push([data[i], data[i + 1], data[i + 2], data[i + 3]]);
  }
  if (pixels.length === 0) return imageData;

  const palette = medianCutPalette(pixels, Math.max(2, targetColors));
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) {
      out[i + 3] = 0;
      continue;
    }
    const [r, g, b] = nearestPaletteColor(data[i], data[i + 1], data[i + 2], palette);
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = data[i + 3];
  }
  return new ImageData(out, width, height);
}

// ─── Public entry point ─────────────────────────────────────────────────────────

export async function pixelSnap(blob: Blob, options: PixelSnapOptions): Promise<Blob> {
  const img = await loadImage(blob);

  const longEdge = options.avoidOverRefining ? AUTO_LONG_EDGE_COARSE : AUTO_LONG_EDGE;
  const scale = longEdge / Math.max(img.width, img.height);
  const targetWidth = Math.max(1, Math.round(img.width * scale));
  const targetHeight = Math.max(1, Math.round(img.height * scale));

  let imageData = downscale(img, targetWidth, targetHeight);

  if (options.palettize !== 'off') {
    const targetColors = options.palettize === 'custom' ? (options.colors ?? AUTO_COLORS) : AUTO_COLORS;
    imageData = quantize(imageData, targetColors);
  }

  const { canvas: smallCanvas, ctx: smallCtx } = canvasFrom(targetWidth, targetHeight);
  smallCtx.putImageData(imageData, 0, 0);

  const outputWidth = options.upscale ? img.width : targetWidth;
  const outputHeight = options.upscale ? img.height : targetHeight;

  const { canvas: outCanvas, ctx: outCtx } = canvasFrom(outputWidth, outputHeight);
  outCtx.imageSmoothingEnabled = false; // hard pixel edges when scaling back up
  outCtx.drawImage(smallCanvas, 0, 0, outputWidth, outputHeight);

  return new Promise((resolve, reject) => {
    outCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed.'))), 'image/png');
  });
}
