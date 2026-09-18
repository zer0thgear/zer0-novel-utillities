'use client';

import { useSettingsStore } from '@/store/settingsStore';
import { useChainStore } from '@/store/chainStore';
import { useSubscription } from '@/hooks/useSubscription';
import { opusStatus } from '@/lib/anlasCost';
import { planChain } from '@/lib/chains';
import { Chain, GeneratedImage } from '@/types/novelai';

/** Prices a chain for some images and hands it to the runner: free runs
 *  start straight away, anything else asks for confirmation first. */
export function useChainLauncher() {
  const formModel = useSettingsStore((s) => s.model);
  const formSteps = useSettingsStore((s) => s.steps);
  const { subscription } = useSubscription();
  const request = useChainStore((s) => s.request);

  return (chain: Chain, images: GeneratedImage[], auto = false) => {
    if (images.length === 0) return;
    const ctx = { formModel, formSteps, ...opusStatus(subscription) };
    const plans = images.map((img) =>
      planChain(
        chain,
        { width: img.parameters.width, height: img.parameters.height, model: img.model, steps: img.parameters.steps },
        ctx,
      ),
    );
    request({
      chain,
      imageIds: images.map((img) => img.id),
      plans,
      total: plans.reduce((sum, p) => sum + p.costPerImage, 0),
      auto,
    });
  };
}
