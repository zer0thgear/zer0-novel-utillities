'use client';

import { useSubscription } from '@/hooks/useSubscription';

// tier: 0=Paper, 1=Tablet, 2=Scroll, 3=Opus — the free V5 generation allowance
// tracked below is an Opus-only perk, so that part only renders for tier 3.
// Anlas balance applies to every tier and is always shown when available.
export function AccountStatusBar() {
  const { subscription } = useSubscription();

  if (!subscription) return null;

  const { fixedTrainingStepsLeft, purchasedTrainingSteps } = subscription.trainingStepsLeft;
  const totalAnlas = fixedTrainingStepsLeft + purchasedTrainingSteps;

  const { percent, isNegative } = subscription.usage;
  const displayPercent = Math.max(0, Math.min(100, percent));

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-slate-800/60 px-3 py-2 text-xs border border-slate-700/50">
      <div className="flex items-center justify-between text-slate-400">
        <span>Anlas</span>
        <span className="font-semibold text-slate-200">{totalAnlas.toLocaleString()}</span>
      </div>

      {subscription.tier === 3 && (
        <div className="flex flex-col gap-1">
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
      )}
    </div>
  );
}
