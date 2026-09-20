import { create } from 'zustand';
import { GeneratedImage } from '@/types/novelai';

// API key lives in localStorage so it survives a full browser close/reopen
const API_KEY_KEY = 'novelai_api_key';

interface SessionState {
  apiKey: string;
  setApiKey: (key: string) => void;
  /** Loads a previously-saved key from localStorage. Must run client-side after mount
   *  (not in the initial state) so server and client render the same HTML on hydration. */
  hydrateApiKey: () => void;

  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  /** What a request is waiting on while it retries, e.g. "Rate limited —
   *  retrying in 5s (1/3)". Null when nothing is being retried. */
  retryNotice: string | null;
  setRetryNotice: (notice: string | null) => void;

  // Live preview frame shown during streaming generation (object URL or null)
  streamPreview: string | null;
  setStreamPreview: (url: string | null) => void;

  images: GeneratedImage[];
  addImages: (images: GeneratedImage[]) => void;
  /** Merges fields into existing images (e.g. tagging a chain's results). */
  updateImages: (ids: string[], patch: Partial<GeneratedImage>) => void;
  removeImage: (id: string) => void;
  clearImages: () => void;

  // The image currently displayed in the center viewer
  focusedImageId: string | null;
  setFocusedImageId: (id: string | null) => void;

  /** A group (batchId) shown on the canvas as a grid, like NovelAI shows a
   *  multi-image generation. While one of its images is open it stays set,
   *  so the viewer can go back to the grid. */
  focusedGroupId: string | null;
  showGroup: (batchId: string) => void;
  /** From one of the group's images back to its grid. */
  backToGroup: () => void;

  // A past result loaded as the base image for the next img2img generation
  // ("Use as Base Image"). Cleared after use or on explicit removal.
  img2imgSource: { blob: Blob; url: string; width: number; height: number } | null;
  setImg2imgSource: (source: { blob: Blob; url: string; width: number; height: number } | null) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  apiKey: '',

  setApiKey: (key) => {
    if (typeof window !== 'undefined') {
      if (key) localStorage.setItem(API_KEY_KEY, key);
      else localStorage.removeItem(API_KEY_KEY);
    }
    set({ apiKey: key });
  },

  hydrateApiKey: () => {
    const stored = localStorage.getItem(API_KEY_KEY);
    if (stored) set({ apiKey: stored });
  },

  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading, ...(loading ? {} : { retryNotice: null }) }),

  retryNotice: null,
  setRetryNotice: (notice) => set({ retryNotice: notice }),

  streamPreview: null,
  setStreamPreview: (url) =>
    set((state) => {
      // Revoke previous preview URL to avoid memory leaks
      if (state.streamPreview) URL.revokeObjectURL(state.streamPreview);
      return { streamPreview: url };
    }),

  images: [],

  addImages: (newImages) =>
    set((state) => {
      const images = [...newImages, ...state.images];
      const batchId = newImages[0]?.batchId;
      const focused = state.images.find((img) => img.id === state.focusedImageId);
      const viewingGroup =
        !!batchId && (state.focusedGroupId === batchId || focused?.batchId === batchId);
      // A multi-image generation opens as a grid, as on NovelAI; a queued run,
      // sweep or batch you're watching grows its grid as images arrive.
      if (batchId && (newImages.length > 1 || viewingGroup)) {
        return { images, focusedGroupId: batchId, focusedImageId: null };
      }
      // Otherwise the newest image.
      return { images, focusedImageId: newImages[0]?.id ?? state.focusedImageId, focusedGroupId: null };
    }),

  updateImages: (ids, patch) =>
    set((state) => ({
      images: state.images.map((img) => (ids.includes(img.id) ? { ...img, ...patch } : img)),
    })),

  removeImage: (id) =>
    set((state) => {
      const target = state.images.find((img) => img.id === id);
      if (target) {
        URL.revokeObjectURL(target.url);
        if (target.sourceImageUrl) URL.revokeObjectURL(target.sourceImageUrl);
      }
      const newImages = state.images.filter((img) => img.id !== id);
      const groupLeft = state.focusedGroupId && newImages.some((img) => img.batchId === state.focusedGroupId);
      const focusedGroupId = groupLeft ? state.focusedGroupId : null;
      // Removing the open image goes back to its group's grid if any of it is
      // left, else to the newest image.
      let focusedImageId = state.focusedImageId === id ? null : state.focusedImageId;
      if (!focusedImageId && !focusedGroupId) focusedImageId = newImages[0]?.id ?? null;
      return { images: newImages, focusedImageId, focusedGroupId };
    }),

  clearImages: () =>
    set((state) => {
      state.images.forEach((img) => {
        URL.revokeObjectURL(img.url);
        if (img.sourceImageUrl) URL.revokeObjectURL(img.sourceImageUrl);
      });
      return { images: [], focusedImageId: null, focusedGroupId: null };
    }),

  focusedImageId: null,
  setFocusedImageId: (id) =>
    set((state) => {
      // Opening one of the shown group's images keeps the way back to its grid.
      const image = state.images.find((img) => img.id === id);
      const keepGroup = !!state.focusedGroupId && image?.batchId === state.focusedGroupId;
      return { focusedImageId: id, focusedGroupId: keepGroup ? state.focusedGroupId : null };
    }),

  focusedGroupId: null,
  showGroup: (batchId) => set({ focusedGroupId: batchId, focusedImageId: null }),
  backToGroup: () => set((state) => (state.focusedGroupId ? { focusedImageId: null } : {})),

  img2imgSource: null,
  setImg2imgSource: (source) =>
    set((state) => {
      if (state.img2imgSource) URL.revokeObjectURL(state.img2imgSource.url);
      return { img2imgSource: source };
    }),
}));
