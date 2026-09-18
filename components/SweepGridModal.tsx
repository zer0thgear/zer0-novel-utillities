'use client';

import { useEffect, useState } from 'react';
import { saveAs } from 'file-saver';
import { useSessionStore } from '@/store/sessionStore';
import { renderSweepGrid } from '@/lib/sweepGridImage';

interface Props {
  sweepId: string;
  onClose: () => void;
}

/** Lays one sweep's images out as a labelled X/Y grid. Cells that never got an
 *  image (sweep stopped early, or a request failed) stay as placeholders so
 *  the rows and columns still line up. */
export function SweepGridModal({ sweepId, onClose }: Props) {
  const { images, focusedImageId, setFocusedImageId } = useSessionStore();
  const cells = images.filter((img) => img.sweep?.id === sweepId);
  const info = cells[0]?.sweep;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function saveImage() {
    if (!info) return;
    setSaving(true);
    setSaveError(null);
    try {
      const blob = await renderSweepGrid(info, cells);
      const axes = [info.x.name, info.y?.name].filter(Boolean).join('-x-').replace(/[^\w-]+/g, '_');
      saveAs(blob, `sweep-${axes}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the grid.');
    } finally {
      setSaving(false);
    }
  }

  if (!info) return null;
  const cols = info.x.values.length;
  const rows = info.y ? info.y.values.length : 1;
  const at = (xi: number, yi: number) =>
    cells.find((img) => img.sweep!.xIndex === xi && (img.sweep!.yIndex ?? 0) === yi);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-full max-w-full flex-col gap-3 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-bold text-slate-100">
            Sweep · {info.x.name}
            {info.y && ` × ${info.y.name}`}
            <span className="ml-2 font-normal text-slate-500">
              {cells.length} of {cols * rows} images · click one to open it
            </span>
          </h2>
          <div className="flex flex-shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={saveImage}
              disabled={saving}
              title="Save the grid, with its labels, as one PNG"
              className="rounded bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save image'}
            </button>
            <button type="button" onClick={onClose} title="Close" className="text-slate-500 hover:text-slate-200">
              ✕
            </button>
          </div>
        </div>
        {saveError && <p className="text-xs text-amber-400">{saveError}</p>}

        <div className="overflow-auto">
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `${info.y ? 'auto ' : ''}repeat(${cols}, minmax(110px, 180px))`,
            }}
          >
            {/* Column headers: X values, after an axis-name corner if there's a Y axis */}
            {info.y && (
              <div className="self-end pb-1 text-right text-[10px] leading-tight text-slate-500">
                {info.y.name} ↓<br />
                {info.x.name} →
              </div>
            )}
            {info.x.values.map((v, xi) => (
              <div key={`h${xi}`} className="truncate pb-1 text-center text-xs font-semibold text-violet-300" title={v}>
                {info.y ? v : `${info.x.name} ${v}`}
              </div>
            ))}

            {Array.from({ length: rows }, (_, yi) => (
              <div key={`r${yi}`} className="contents">
                {info.y && (
                  <div
                    className="flex max-w-[140px] items-center justify-end pr-1 text-right text-xs font-semibold text-violet-300"
                    title={info.y.values[yi]}
                  >
                    <span className="line-clamp-3">{info.y.values[yi]}</span>
                  </div>
                )}
                {info.x.values.map((_, xi) => {
                  const img = at(xi, yi);
                  return img ? (
                    <button
                      key={`c${xi}`}
                      type="button"
                      onClick={() => {
                        setFocusedImageId(img.id);
                        onClose();
                      }}
                      className={`overflow-hidden rounded-lg border bg-slate-950 transition-colors ${
                        img.id === focusedImageId ? 'border-violet-500' : 'border-slate-700 hover:border-slate-400'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt="" className="block w-full object-contain" />
                    </button>
                  ) : (
                    <div
                      key={`c${xi}`}
                      className="flex aspect-[2/3] items-center justify-center rounded-lg border border-dashed border-slate-800 text-xs text-slate-700"
                    >
                      —
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
