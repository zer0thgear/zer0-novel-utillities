'use client';

import { useSubscription } from '@/hooks/useSubscription';

// tier: 0=Paper, 1=Tablet, 2=Scroll, 3=Opus — the free V5 generation allowance
// this meter tracks is an Opus-only perk, so we only render for tier 3.
export function OpusUsageMeter() {
  const { subscription } = useSubscription();

  if (!subscription || subscription.tier !== 3) return null;

  const { percent, isNegative } = subscription.usage;
  const displayPercent = Math.max(0, Math.min(100, percent));

  return (
    <div className="flex flex-col gap-1 rounded-lg bg-slate-800/60 px-3 py-2 text-xs border border-slate-700/50">
      <div className="flex items-center justify-between text-slate-400">
        <span>Opus generations remaining</span>
        <span className={isNegative ? 'text-red-400' : 'text-violet-300'}>{Math.round(percent)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700/60">
        <div
          className={`h-full rounded-full transition-all ${isNegative ? 'bg-red-500' : 'bg-violet-500'}`}
          style={{ width: `${displayPercent}%` }}
        />
      </div>
    </div>
  );
}
