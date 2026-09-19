'use client';

import { useSubscription } from '@/hooks/useSubscription';
import { NovelAISubscription } from '@/types/novelai';

// NovelAI's own estimates, from its client: each 1% of the Opus allowance is
// about 17.3 images (so ~1,730 when full), and `timeUntilNextPercent` is how
// many seconds each 1% takes to refill.
const IMAGES_PER_PERCENT = 17.3;
const images = (percent: number) => Math.round(IMAGES_PER_PERCENT * percent);

/** The Opus allowance as NovelAI's "More Info" dialog reports it. */
function opusUsage(usage: NovelAISubscription['usage']) {
  // Shown as 0 while negative, and not capped at 100 (it can sit above).
  const percent = usage.isNegative ? 0 : Math.max(0, usage.percent);
  const secondsPerPercent = usage.timeUntilNextPercent;
  const perDay = secondsPerPercent > 0 ? Math.round((86400 / secondsPerPercent) * 10) / 10 : 0;
  // Our own addition: at that rate, how long until it's back to 100%.
  const secondsToFull = secondsPerPercent > 0 && percent < 100 ? (100 - percent) * secondsPerPercent : 0;
  return { percent, perDay, secondsToFull };
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

// tier: 0=Paper, 1=Tablet, 2=Scroll, 3=Opus — the free V5 generation allowance
// tracked below is an Opus-only perk, so that part only renders for tier 3.
// Anlas balance applies to every tier and is always shown when available.
export function AccountStatusBar() {
  const { subscription } = useSubscription();

  if (!subscription) return null;

  const { fixedTrainingStepsLeft, purchasedTrainingSteps } = subscription.trainingStepsLeft;
  const totalAnlas = fixedTrainingStepsLeft + purchasedTrainingSteps;

  const { isNegative } = subscription.usage;
  const { percent, perDay, secondsToFull } = opusUsage(subscription.usage);

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-slate-800/60 px-3 py-2 text-xs border border-slate-700/50">
      <div className="flex items-center justify-between text-slate-400">
        <span>Anlas</span>
        <span className="font-semibold text-slate-200">{totalAnlas.toLocaleString()}</span>
      </div>

      {subscription.tier === 3 && (
        <div
          className="flex flex-col gap-1"
          title={`Free V5 generations at normal sizes and up to 28 steps. Image counts are NovelAI's own estimate (about ${IMAGES_PER_PERCENT} per 1%).`}
        >
          <div className="flex items-center justify-between text-slate-400">
            <span>Opus generations remaining</span>
            <span className={isNegative ? 'text-red-400' : 'text-violet-300'}>
              {Math.round(percent)}%
              <span className="ml-1 text-slate-500">(~{images(percent).toLocaleString()})</span>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700/60">
            <div
              className={`h-full rounded-full transition-all ${isNegative ? 'bg-red-500' : 'bg-violet-500'}`}
              style={{ width: `${Math.min(100, percent)}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500">
            {isNegative && 'Used up; generations cost Anlas until it refills. '}
            {percent >= 100
              ? 'Full. It stops refilling at 100%.'
              : perDay > 0
                ? `Refills ${perDay}% a day (~${images(perDay)} images)${secondsToFull > 0 ? `, full in ~${formatDuration(secondsToFull)}` : ''}.`
                : null}
          </p>
        </div>
      )}
    </div>
  );
}
