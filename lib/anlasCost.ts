// NovelAI's Anlas cost formula for the modern model families this app supports
// (V3/V4/V4.5/V5). NovelAI doesn't publish this anywhere, and a formula/constants
// borrowed from community API wrappers (e.g. Aedial/novelai-api) turned out to be
// stale — it predicted 42 Anlas for a 1472x1472 @ 28-step V5 generation when
// novelai.net's own live cost preview showed 63. The A/B constants below were
// instead fit directly from 4 real (resolution, steps) -> cost data points read
// off novelai.net's own Settings panel on 2026-09-17 (no generation triggered):
//   1472x768  @ 28 steps -> 33      1472x768  @ 50 steps -> 54
//   1472x1472 @ 28 steps -> 63      1472x1472 @ 50 steps -> 104
// This fit reproduces all 4 points exactly, but 4 points can't pin down the
// true constants precisely — present results as an estimate, not a guaranteed
// figure. Re-derive if NovelAI's pricing changes again (see
// memory/project_novelai_anlas_cost.md).
const COST_A = 4.9e-6;
const COST_B = 8.55e-7;

// SMEA/SMEA DYN multipliers are NOT independently re-verified — NovelAI's
// current web UI has no SMEA toggle at all (likely V3-only at this point), so
// there was nothing to test live. Carried over from the same community formula
// whose base constants above turned out stale; treat with the same caution.
const SMEA_FACTOR = 1.2;
const SMEA_DYN_FACTOR = 1.4;

export interface AnlasCostInput {
  width: number;
  height: number;
  steps: number;
  smea: boolean;
  smeaDyn: boolean;
  nSamples?: number;
  isOpus: boolean;
}

// Confirmed live (2026-09-16, see memory/project_novelai_editing_tools_api.md):
// img2img strength/noise do NOT change cost at all — dropped entirely here
// rather than repeating the community formula's (apparently also wrong)
// strength discount.
export function calculateAnlasCost({
  width,
  height,
  steps,
  smea,
  smeaDyn,
  nSamples = 1,
  isOpus,
}: AnlasCostInput): number {
  const n = Math.max(1, nSamples);
  const r = Math.max(width * height, 65536);
  const smeaFactor = !smea ? 1 : !smeaDyn ? SMEA_FACTOR : SMEA_DYN_FACTOR;

  const perSample = Math.max(Math.ceil((COST_A * r + COST_B * r * steps) * smeaFactor), 2);

  const opusDiscount = isOpus && steps <= 28 && r <= 1024 * 1024;
  return perSample * (n - (opusDiscount ? 1 : 0));
}
