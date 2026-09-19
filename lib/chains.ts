import { Chain, ChainDirectorTool, ChainStep, NovelAIModel } from '@/types/novelai';
import {
  calculateAnlasCost,
  directorToolCost,
  MAX_GENERATION_PIXELS,
  UPSCALE_MAX_PIXELS,
  upscaleCost,
} from '@/lib/anlasCost';
import { normalizePromptPart } from '@/lib/promptText';

// Chained actions: a saved sequence of image actions, each step applied to the
// previous step's result. Everything here is pure (labels, validation, cost
// planning, parsing imports); ChainRunner does the actual running.

// Mirrors ENHANCE_LEVELS in hooks/useEnhance.ts (strength drives the price).
const ENHANCE_STRENGTH: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0.2, 2: 0.4, 3: 0.5, 4: 0.6, 5: 0.7 };
// Mirrors hooks/useVariations.ts.
const VARIATION_COUNT = 3;
const VARIATION_STRENGTH = 0.8;

export const DIRECTOR_TOOLS: { value: ChainDirectorTool; label: string }[] = [
  { value: 'bg-removal', label: 'Remove BG' },
  { value: 'lineart', label: 'Line Art' },
  { value: 'sketch', label: 'Sketch' },
  { value: 'declutter', label: 'Declutter' },
  { value: 'colorize', label: 'Colorize' },
  { value: 'emotion', label: 'Emotion' },
];

export const EMOTIONS = ['Neutral', 'Happy', 'Sad', 'Angry', 'Scared', 'Surprised', 'Tired', 'Excited'];

export const STEP_KINDS: { value: ChainStep['kind']; label: string }[] = [
  { value: 'tags', label: 'Add Tags' },
  { value: 'enhance', label: 'Enhance' },
  { value: 'upscale', label: 'Upscale' },
  { value: 'director', label: 'Director Tool' },
  { value: 'pixelSnap', label: 'Pixel Snap' },
  { value: 'variations', label: 'Variations' },
  { value: 'download', label: 'Download' },
];

/** A new step of a kind, with the same defaults the viewer's own panels use. */
export function defaultStep(kind: ChainStep['kind']): ChainStep {
  switch (kind) {
    case 'enhance':
      return { kind, level: 3, upscale: false };
    case 'director':
      return { kind, tool: 'bg-removal' };
    case 'pixelSnap':
      return { kind, palettize: 'auto', upscale: true };
    case 'tags':
      return { kind, tags: '' };
    default:
      return { kind };
  }
}

export function stepLabel(step: ChainStep): string {
  switch (step.kind) {
    case 'enhance':
      return `Enhance L${step.level}${step.upscale ? ' ×1.5' : ''}`;
    case 'upscale':
      return 'Upscale ×2';
    case 'variations':
      return `Variations ×${VARIATION_COUNT}`;
    case 'director': {
      const tool = DIRECTOR_TOOLS.find((t) => t.value === step.tool)?.label ?? step.tool;
      return step.tool === 'emotion' && step.emotion ? `${tool}: ${step.emotion}` : tool;
    }
    case 'pixelSnap':
      return 'Pixel Snap';
    case 'download':
      return 'Download';
    case 'tags': {
      const tags = normalizePromptPart(step.tags);
      return tags ? `+ ${tags.length > 30 ? `${tags.slice(0, 30)}…` : tags}` : 'Add Tags';
    }
  }
}

/** Steps that render from the prompt, so an Add Tags step before them counts. */
const usesPrompt = (step: ChainStep) => step.kind === 'enhance' || step.kind === 'variations';

export const chainSummary = (chain: Chain) => chain.steps.map(stepLabel).join(' → ') || 'No steps';

/** Steps whose output is a new image (Download passes its input along, and
 *  Add Tags only changes the prompt for later steps). */
export const producesImage = (step: ChainStep) => step.kind !== 'download' && step.kind !== 'tags';

// ── Planning ────────────────────────────────────────────────────────────────

export interface ChainContext {
  /** Enhance renders with the sidebar's model and steps, as the viewer's does. */
  formModel: NovelAIModel;
  formSteps: number;
  isOpus: boolean;
  opusExhausted: boolean;
}

export interface PlannedStep {
  label: string;
  /** Anlas per source image. */
  cost: number;
  /** Size of this step's output. */
  width: number;
  height: number;
  problem?: string;
}

export interface ChainPlan {
  steps: PlannedStep[];
  costPerImage: number;
  problems: string[];
}

const round64 = (n: number) => Math.round(n / 64) * 64;
const tooLarge = (w: number, h: number) =>
  w * h > MAX_GENERATION_PIXELS
    ? `NovelAI can't render ${w}×${h}; the limit is about 3.1 megapixels. Put this step before any upscaling.`
    : undefined;

/** Walks a chain over an image's size and model, pricing each step with
 *  NovelAI's formulas and flagging steps that can't run. */
export function planChain(
  chain: Chain,
  image: { width: number; height: number; model: NovelAIModel; steps: number },
  ctx: ChainContext,
): ChainPlan {
  let { width, height, model, steps } = image;
  const opus = { isOpus: ctx.isOpus, opusExhausted: ctx.opusExhausted };
  const planned: PlannedStep[] = [];
  const problems: string[] = [];
  if (chain.steps.length === 0) problems.push('This chain has no steps.');

  chain.steps.forEach((step, i) => {
    let cost = 0;
    let problem: string | undefined;
    switch (step.kind) {
      case 'enhance': {
        const w = step.upscale ? round64(width * 1.5) : width;
        const h = step.upscale ? round64(height * 1.5) : height;
        cost = calculateAnlasCost({
          model: ctx.formModel,
          width: w,
          height: h,
          steps: ctx.formSteps,
          smea: false,
          smeaDyn: false,
          strength: ENHANCE_STRENGTH[step.level],
          ...opus,
        });
        problem = tooLarge(w, h);
        width = w;
        height = h;
        model = ctx.formModel;
        steps = ctx.formSteps;
        break;
      }
      case 'upscale': {
        if (width * height > UPSCALE_MAX_PIXELS) {
          problem = `Upscale only takes images up to 1 megapixel, and this step would get ${width}×${height}. Move it before any Enhance ×1.5 or Upscale.`;
        }
        cost = upscaleCost(width, height) ?? 0;
        width *= 2;
        height *= 2;
        break;
      }
      case 'variations':
        problem =
          i !== chain.steps.length - 1
            ? `Variations makes ${VARIATION_COUNT} images, so it can only be the last step.`
            : tooLarge(width, height);
        cost = calculateAnlasCost({
          model,
          width,
          height,
          steps,
          smea: false,
          smeaDyn: false,
          nSamples: VARIATION_COUNT,
          strength: VARIATION_STRENGTH,
          ...opus,
        });
        break;
      case 'director':
        cost = directorToolCost(step.tool, width, height, opus);
        if (step.tool === 'emotion' && !step.emotion) problem = 'Pick an emotion.';
        break;
      case 'pixelSnap':
        // Without "upscale" the result is the small pixel grid itself (about
        // 64 px on its long side); later steps then work on that.
        if (!step.upscale) {
          const k = (step.avoidOverRefining ? 48 : 64) / Math.max(width, height);
          width = Math.max(1, Math.round(width * k));
          height = Math.max(1, Math.round(height * k));
        }
        break;
      case 'download':
        break;
      case 'tags':
        if (!step.tags.trim()) problem = 'Enter the tags to add.';
        else if (!chain.steps.slice(i + 1).some(usesPrompt))
          problem = 'Only Enhance and Variations use the prompt, and neither comes after this step.';
        break;
    }
    planned.push({ label: stepLabel(step), cost, width, height, problem });
    if (problem) problems.push(`Step ${i + 1} (${stepLabel(step)}): ${problem}`);
  });

  return { steps: planned, costPerImage: planned.reduce((sum, s) => sum + s.cost, 0), problems };
}

// ── Import (untrusted input) ────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function parseStep(v: unknown): ChainStep | null {
  if (!isObj(v)) return null;
  switch (v.kind) {
    case 'enhance': {
      const level = Number(v.level);
      return [1, 2, 3, 4, 5].includes(level)
        ? { kind: 'enhance', level: level as 1 | 2 | 3 | 4 | 5, upscale: v.upscale === true }
        : null;
    }
    case 'upscale':
    case 'variations':
    case 'download':
      return { kind: v.kind };
    case 'tags':
      return typeof v.tags === 'string' ? { kind: 'tags', tags: v.tags } : null;
    case 'director': {
      if (!DIRECTOR_TOOLS.some((t) => t.value === v.tool)) return null;
      const defry = Number(v.defry);
      return {
        kind: 'director',
        tool: v.tool as ChainDirectorTool,
        ...(typeof v.prompt === 'string' ? { prompt: v.prompt } : {}),
        ...(Number.isInteger(defry) && defry >= 0 && defry <= 5 ? { defry } : {}),
        ...(typeof v.emotion === 'string' && EMOTIONS.includes(v.emotion) ? { emotion: v.emotion } : {}),
      };
    }
    case 'pixelSnap': {
      if (!['off', 'auto', 'custom'].includes(v.palettize as string)) return null;
      const colors = Number(v.colors);
      return {
        kind: 'pixelSnap',
        palettize: v.palettize as 'off' | 'auto' | 'custom',
        ...(Number.isInteger(colors) && colors >= 2 && colors <= 256 ? { colors } : {}),
        avoidOverRefining: v.avoidOverRefining === true,
        upscale: v.upscale === true,
      };
    }
    default:
      return null;
  }
}

/** A chain from an import file, or null if it isn't one. Unknown steps are dropped. */
export function parseChain(v: unknown): Chain | null {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.name !== 'string' || !Array.isArray(v.steps)) return null;
  return { id: v.id, name: v.name, steps: v.steps.map(parseStep).filter((s): s is ChainStep => s !== null) };
}
