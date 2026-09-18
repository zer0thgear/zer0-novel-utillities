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
  setIsLoading: (loading) => set({ isLoading: loading }),

  streamPreview: null,
  setStreamPreview: (url) =>
    set((state) => {
      // Revoke previous preview URL to avoid memory leaks
      if (state.streamPreview) URL.revokeObjectURL(state.streamPreview);
      return { streamPreview: url };
    }),

  images: [],

  addImages: (newImages) =>
    set((state) => ({
      images: [...newImages, ...state.images],
      // Auto-focus the newest image
      focusedImageId: newImages[0]?.id ?? state.focusedImageId,
    })),

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
      // If we removed the focused image, focus the first remaining one
      const focusedImageId =
        state.focusedImageId === id ? (newImages[0]?.id ?? null) : state.focusedImageId;
      return { images: newImages, focusedImageId };
    }),

  clearImages: () =>
    set((state) => {
      state.images.forEach((img) => {
        URL.revokeObjectURL(img.url);
        if (img.sourceImageUrl) URL.revokeObjectURL(img.sourceImageUrl);
      });
      return { images: [], focusedImageId: null };
    }),

  focusedImageId: null,
  setFocusedImageId: (id) => set({ focusedImageId: id }),

  img2imgSource: null,
  setImg2imgSource: (source) =>
    set((state) => {
      if (state.img2imgSource) URL.revokeObjectURL(state.img2imgSource.url);
      return { img2imgSource: source };
    }),
}));
