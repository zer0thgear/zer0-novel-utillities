import { GeneratedImage, SweepCellInfo } from '@/types/novelai';

// Renders a sweep as one labelled PNG, laid out like the grid view: X values
// across the top, Y values down the left, axis names in the corner.

const MAX_SIDE = 4096;
const BG = '#0f172a'; // slate-900
const PANEL = '#1e293b'; // slate-800
const TEXT = '#e2e8f0'; // slate-200
const ACCENT = '#c4b5fd'; // violet-300
const MUTED = '#64748b'; // slate-500

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Wraps text to at most `maxLines` lines of `width`, ellipsizing the rest. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

export async function renderSweepGrid(info: SweepCellInfo, images: GeneratedImage[]): Promise<Blob> {
  const cols = info.x.values.length;
  const rows = info.y ? info.y.values.length : 1;
  const at = (xi: number, yi: number) =>
    images.find((img) => img.sweep?.xIndex === xi && (img.sweep?.yIndex ?? 0) === yi);
  const loaded = new Map<string, HTMLImageElement>(
    await Promise.all(images.map(async (img) => [img.id, await loadImage(img.url)] as const)),
  );

  // Every cell shares one size (size is never a sweep axis); scale cells down
  // so the whole sheet stays within MAX_SIDE on both sides.
  const sample = loaded.values().next().value;
  const srcW = sample?.naturalWidth ?? 832;
  const srcH = sample?.naturalHeight ?? 1216;
  const provisional = Math.min(1, (MAX_SIDE * 0.85) / (cols * srcW), (MAX_SIDE * 0.85) / (rows * srcH));
  const cellW = Math.max(64, Math.floor(srcW * provisional));
  const cellH = Math.max(64, Math.floor(srcH * provisional));

  const font = Math.max(14, Math.round(cellW * 0.06));
  const gap = Math.max(4, Math.round(font * 0.4));
  const pad = font;
  const lineH = Math.round(font * 1.25);
  const titleH = Math.round(font * 1.6) + gap;
  const headerH = lineH * 2 + gap;
  // The row-label column fits its widest label (short values like "4" stay
  // narrow), capped so long wildcard options wrap instead of eating the grid.
  let sideW = 0;
  if (info.y) {
    const measure = document.createElement('canvas').getContext('2d')!;
    measure.font = `600 ${font}px system-ui, sans-serif`;
    const cap = Math.min(Math.round(cellW * 0.9), Math.round(font * 12));
    const widest = Math.max(
      ...info.y.values.map((v) => measure.measureText(v).width),
      measure.measureText(`${info.x.name} →`).width * 0.85,
      measure.measureText(`${info.y.name} ↓`).width * 0.85,
    );
    sideW = Math.min(cap, Math.ceil(widest) + gap);
  }

  const width = Math.min(MAX_SIDE, pad * 2 + sideW + (info.y ? gap : 0) + cols * cellW + (cols - 1) * gap);
  const height = Math.min(MAX_SIDE, pad * 2 + titleH + headerH + rows * cellH + (rows - 1) * gap);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = 'top';

  // Title: axis names.
  ctx.font = `600 ${Math.round(font * 1.15)}px system-ui, sans-serif`;
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'left';
  ctx.fillText(`Sweep · ${info.x.name}${info.y ? ` × ${info.y.name}` : ''}`, pad, pad);

  const gridLeft = pad + sideW + (info.y ? gap : 0);
  const gridTop = pad + titleH + headerH;
  const cellX = (xi: number) => gridLeft + xi * (cellW + gap);
  const cellY = (yi: number) => gridTop + yi * (cellH + gap);

  ctx.font = `600 ${font}px system-ui, sans-serif`;

  // Column headers.
  ctx.textAlign = 'center';
  ctx.fillStyle = ACCENT;
  info.x.values.forEach((value, xi) => {
    const label = info.y ? value : `${info.x.name} ${value}`;
    const lines = wrap(ctx, label, cellW - gap, 2);
    const top = gridTop - gap - lines.length * lineH;
    lines.forEach((l, i) => ctx.fillText(l, cellX(xi) + cellW / 2, top + i * lineH));
  });

  // Row headers and the corner.
  if (info.y) {
    ctx.textAlign = 'right';
    info.y.values.forEach((value, yi) => {
      const lines = wrap(ctx, value, sideW - gap, 3);
      const top = cellY(yi) + cellH / 2 - (lines.length * lineH) / 2;
      lines.forEach((l, i) => ctx.fillText(l, pad + sideW, top + i * lineH));
    });
    ctx.fillStyle = MUTED;
    ctx.font = `${Math.round(font * 0.85)}px system-ui, sans-serif`;
    ctx.fillText(`${info.y.name} ↓`, pad + sideW, gridTop - gap - lineH * 2);
    ctx.fillText(`${info.x.name} →`, pad + sideW, gridTop - gap - lineH);
  }

  // Cells: the image scaled to fit, or a placeholder where none was made.
  for (let yi = 0; yi < rows; yi++) {
    for (let xi = 0; xi < cols; xi++) {
      const x = cellX(xi);
      const y = cellY(yi);
      const img = at(xi, yi);
      const el = img && loaded.get(img.id);
      if (el) {
        const s = Math.min(cellW / el.naturalWidth, cellH / el.naturalHeight);
        const w = el.naturalWidth * s;
        const h = el.naturalHeight * s;
        ctx.drawImage(el, x + (cellW - w) / 2, y + (cellH - h) / 2, w, h);
      } else {
        ctx.fillStyle = PANEL;
        ctx.fillRect(x, y, cellW, cellH);
        ctx.fillStyle = MUTED;
        ctx.textAlign = 'center';
        ctx.fillText('—', x + cellW / 2, y + cellH / 2 - lineH / 2);
      }
    }
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not render the grid.'))), 'image/png'),
  );
}
