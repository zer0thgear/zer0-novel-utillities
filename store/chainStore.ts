import { create } from 'zustand';
import { Chain } from '@/types/novelai';
import type { ChainPlan } from '@/lib/chains';

// Queue and status for chained actions. ChainRunner (mounted once) works
// through `queue` one step at a time; anything that costs Anlas waits in
// `pending` until the user confirms it.

export interface ChainRequest {
  chain: Chain;
  imageIds: string[];
  /** One plan per image (sizes, and so prices, can differ). */
  plans: ChainPlan[];
  total: number;
  /** Offered automatically after a generation, rather than started by hand. */
  auto: boolean;
}

interface ChainJob {
  chain: Chain;
  imageId: string;
}

export interface ChainProgress {
  name: string;
  image: number;
  images: number;
  step: number;
  steps: number;
  label: string;
}

interface ChainState {
  pending: ChainRequest | null;
  queue: ChainJob[];
  /** Images in the run that started the current queue, for "image 2 of 4". */
  queuedTotal: number;
  progress: ChainProgress | null;
  stopRequested: boolean;
  error: string | null;
  /** Free runs start at once; anything that costs Anlas waits for confirm(). */
  request: (req: ChainRequest) => void;
  confirm: () => void;
  cancel: () => void;
  stop: () => void;
  clearError: () => void;
  /** Runner-only: take the next job, or null when the queue is empty. */
  takeNext: () => ChainJob | null;
  setProgress: (progress: ChainProgress | null) => void;
  finish: (error?: string) => void;
}

const enqueue = (state: ChainState, req: ChainRequest) => ({
  queue: [...state.queue, ...req.imageIds.map((imageId) => ({ chain: req.chain, imageId }))],
  queuedTotal: state.queue.length === 0 && !state.progress ? req.imageIds.length : state.queuedTotal + req.imageIds.length,
  stopRequested: false,
  error: null,
});

export const useChainStore = create<ChainState>((set, get) => ({
  pending: null,
  queue: [],
  queuedTotal: 0,
  progress: null,
  stopRequested: false,
  error: null,

  request: (req) =>
    set((state) =>
      req.total === 0 && req.plans.every((p) => p.problems.length === 0)
        ? { ...enqueue(state, req), pending: null }
        : { pending: req },
    ),
  confirm: () =>
    set((state) => (state.pending ? { ...enqueue(state, state.pending), pending: null } : {})),
  cancel: () => set({ pending: null }),
  stop: () => set({ stopRequested: true, queue: [] }),
  clearError: () => set({ error: null }),

  takeNext: () => {
    const [next, ...rest] = get().queue;
    if (!next) return null;
    set({ queue: rest });
    return next;
  },
  setProgress: (progress) => set({ progress }),
  finish: (error) => set({ progress: null, stopRequested: false, queue: [], queuedTotal: 0, ...(error ? { error } : {}) }),
}));

/** True while a chain is queued or running: other image actions wait. */
export const useChainBusy = () => useChainStore((s) => s.progress !== null || s.queue.length > 0);
