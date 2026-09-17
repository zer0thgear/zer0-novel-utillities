'use client';

interface ReorderArrowsProps {
  index: number;
  count: number;
  onMove: (direction: 'up' | 'down') => void;
  label: string;
}

/** Up/down reorder arrows, matching NovelAI's own prompt-reordering controls.
 *  Ends are disabled rather than hidden so the row's width doesn't jitter as
 *  items move between the ends and the middle. */
export function ReorderArrows({ index, count, onMove, label }: ReorderArrowsProps) {
  if (count < 2) return null;

  const btn =
    'px-0.5 leading-none text-[10px] transition-colors disabled:opacity-20 disabled:cursor-default';

  return (
    <div className="flex flex-shrink-0 flex-col">
      <button
        type="button"
        onClick={() => onMove('up')}
        disabled={index === 0}
        title={`Move ${label} up`}
        className={`${btn} text-slate-600 enabled:hover:text-violet-400`}
      >
        ▲
      </button>
      <button
        type="button"
        onClick={() => onMove('down')}
        disabled={index === count - 1}
        title={`Move ${label} down`}
        className={`${btn} text-slate-600 enabled:hover:text-violet-400`}
      >
        ▼
      </button>
    </div>
  );
}
