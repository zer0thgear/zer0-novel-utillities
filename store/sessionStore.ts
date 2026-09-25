import { create } from 'zustand';
import { GeneratedImage, WildcardPicks } from '@/types/novelai';

// API key lives in localStorage so it survives a full browser close/reopen
const API_KEY_KEY = 'novelai_api_key';

/** The Image2Image base, and what the canvas editors need to reopen it. */
export interface Img2ImgSource {
  /** What gets sent: the picture, with any paint from Edit Image on it. */
  blob: Blob;
  url: string;
  width: number;
  height: number;
  /** Edit Image keeps the picture and its paint apart, so reopening it
   *  carries on with the paint still editable. */
  original?: Blob;
  paint?: Blob;
  /** Inpainting: the mask as its editor keeps it (an eighth the size), the
   *  full-size black and white one sent, and a preview of it. */
  mask?: { layer: Blob; full: Blob; url: string };
  /** The history image this started from: its result can then be compared
   *  with it ("Hold: Original"), and its wildcard rolls are replayed. */
  from?: { imageId: string; picks?: WildcardPicks };
}

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
  /** Removes several at once, for the history's multi-select. */
  removeImages: (ids: string[]) => void;
  /** Pins or unpins an image, which is what keeps it through Clear Session. */
  togglePin: (id: string) => void;
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

  // The Image2Image base for the next generation: a past result ("Use as
  // Base"), a dropped image, or what the Edit / Inpaint canvas saved.
  img2imgSource: Img2ImgSource | null;
  setImg2imgSource: (source: Img2ImgSource | null) => void;
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

  removeImage: (id) => useSessionStore.getState().removeImages([id]),

  removeImages: (ids) =>
    set((state) => {
      const gone = new Set(ids);
      for (const image of state.images) {
        if (!gone.has(image.id)) continue;
        URL.revokeObjectURL(image.url);
        if (image.sourceImageUrl) URL.revokeObjectURL(image.sourceImageUrl);
      }
      const newImages = state.images.filter((img) => !gone.has(img.id));
      const groupLeft = state.focusedGroupId && newImages.some((img) => img.batchId === state.focusedGroupId);
      const focusedGroupId = groupLeft ? state.focusedGroupId : null;
      // Removing the open image goes back to its group's grid if any of it is
      // left, else to the newest image.
      let focusedImageId = state.focusedImageId && gone.has(state.focusedImageId) ? null : state.focusedImageId;
      if (!focusedImageId && !focusedGroupId) focusedImageId = newImages[0]?.id ?? null;
      return { images: newImages, focusedImageId, focusedGroupId };
    }),

  togglePin: (id) =>
    set((state) => ({
      images: state.images.map((img) => (img.id === id ? { ...img, pinned: !img.pinned } : img)),
    })),

  /** Clears everything except the pinned images. */
  clearImages: () =>
    set((state) => {
      state.images.forEach((img) => {
        if (img.pinned) return;
        URL.revokeObjectURL(img.url);
        if (img.sourceImageUrl) URL.revokeObjectURL(img.sourceImageUrl);
      });
      const kept = state.images.filter((img) => img.pinned);
      const focusedImageId = kept.some((img) => img.id === state.focusedImageId)
        ? state.focusedImageId
        : (kept[0]?.id ?? null);
      return { images: kept, focusedImageId, focusedGroupId: null };
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
      const old = state.img2imgSource;
      if (old) {
        if (old.url !== source?.url) URL.revokeObjectURL(old.url);
        if (old.mask && old.mask.url !== source?.mask?.url) URL.revokeObjectURL(old.mask.url);
      }
      return { img2imgSource: source };
    }),
}));
